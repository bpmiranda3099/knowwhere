package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/google/uuid"
)

type licenseResponse struct {
	Ok        bool   `json:"ok"`
	Reason    string `json:"reason"`
	ExpiresAt string `json:"expiresAt"`
	Status    string `json:"status"`
}

type configResponse struct {
	Config    string `json:"config"`
	UpdatedAt string `json:"updatedAt"`
}

func readInput(prompt string) string {
	fmt.Print(prompt)
	scanner := bufio.NewScanner(os.Stdin)
	if scanner.Scan() {
		return strings.TrimSpace(scanner.Text())
	}
	return ""
}

func validateLicense(apiBase, key, machineID string) error {
	payload := map[string]string{"apiKey": key, "machineId": machineID}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(apiBase+"/api/license/validate", "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()
	var lr licenseResponse
	if err := json.NewDecoder(resp.Body).Decode(&lr); err != nil {
		return fmt.Errorf("bad response: %w", err)
	}
	if !lr.Ok {
		return fmt.Errorf("license not valid: %s", lr.Reason)
	}
	return nil
}

func fetchConfigByKey(apiBase, key string) (string, error) {
	payload := map[string]string{"apiKey": key}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(apiBase+"/api/config/by-key", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == 404 {
		return "", nil
	}
	var cfg configResponse
	if err := json.NewDecoder(resp.Body).Decode(&cfg); err != nil {
		return "", fmt.Errorf("bad response: %w", err)
	}
	return cfg.Config, nil
}

func writeEnvFile(content, path string) error {
	return os.WriteFile(path, []byte(content), 0600)
}

func commandExists(cmd string) bool {
	_, err := exec.LookPath(cmd)
	return err == nil
}

func installPrereqs() {
	switch runtime.GOOS {
	case "windows":
		fmt.Println("Checking/installing prerequisites via winget/choco (Docker Desktop, Git).")
		if !commandExists("docker") {
			tryRun("winget", "install", "--id=Docker.DockerDesktop", "-e", "--accept-source-agreements", "--accept-package-agreements")
		}
		if !commandExists("git") {
			tryRun("winget", "install", "--id=Git.Git", "-e", "--accept-source-agreements", "--accept-package-agreements")
		}
	case "linux":
		fmt.Println("Checking/installing prerequisites via package manager (Docker, Compose plugin, Git).")
		installPrereqsLinux()
	default:
		fmt.Println("Please ensure Docker/Compose and Git are installed. (Auto-install not implemented on this OS.)")
	}
}

func tryRun(cmd string, args ...string) {
	if !commandExists(cmd) {
		fmt.Printf("Missing %s, skipping auto-install\n", cmd)
		return
	}
	c := exec.Command(cmd, args...)
	c.Stdout = os.Stdout
	c.Stderr = os.Stderr
	_ = c.Run()
}

func installPrereqsLinux() {
	pkgMgr := ""
	switch {
	case commandExists("apt"):
		pkgMgr = "apt"
	case commandExists("apt-get"):
		pkgMgr = "apt-get"
	case commandExists("dnf"):
		pkgMgr = "dnf"
	case commandExists("yum"):
		pkgMgr = "yum"
	}

	if pkgMgr == "" {
		fmt.Println("No supported package manager (apt/dnf/yum) found. Please install Docker/Compose and Git manually.")
		return
	}

	// Update package index
	tryRun("sudo", pkgMgr, "update")

	// Install Docker, Compose plugin, Git
	switch pkgMgr {
	case "apt", "apt-get":
		if !commandExists("docker") {
			tryRun("sudo", pkgMgr, "install", "-y", "docker.io")
		}
		// docker compose plugin
		tryRun("sudo", pkgMgr, "install", "-y", "docker-compose-plugin")
		if !commandExists("git") {
			tryRun("sudo", pkgMgr, "install", "-y", "git")
		}
	case "dnf", "yum":
		if !commandExists("docker") {
			tryRun("sudo", pkgMgr, "install", "-y", "docker")
		}
		tryRun("sudo", pkgMgr, "install", "-y", "docker-compose-plugin")
		if !commandExists("git") {
			tryRun("sudo", pkgMgr, "install", "-y", "git")
		}
	}

	// Enable/start Docker if available
	if commandExists("systemctl") {
		tryRun("sudo", "systemctl", "enable", "--now", "docker")
	}
}

func runComposeUp(dir string) error {
	cmd := exec.Command("docker", "compose", "up", "-d")
	cmd.Dir = dir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func main() {
	apiBase := readInput("API base (e.g., https://knowwhere-web.vercel.app): ")
	if apiBase == "" {
		apiBase = "https://knowwhere-web.vercel.app"
	}
	apiKey := readInput("Enter your API key (license): ")
	if apiKey == "" {
		fmt.Println("API key required.")
		return
	}
	repoURL := readInput("Git repo URL [https://github.com/bpmiranda3099/knowwhere.git]: ")
	if repoURL == "" {
		repoURL = "https://github.com/bpmiranda3099/knowwhere.git"
	}
	targetDir := readInput("Clone directory [knowwhere]: ")
	if targetDir == "" {
		targetDir = "knowwhere"
	}
	machineID := uuid.NewString()

	fmt.Println("Validating license...")
	if err := validateLicense(apiBase, apiKey, machineID); err != nil {
		fmt.Printf("License validation failed: %v\n", err)
		return
	}
	fmt.Println("License OK.")

	fmt.Println("Fetching encrypted config from server...")
	cfg, err := fetchConfigByKey(apiBase, apiKey)
	if err != nil {
		fmt.Printf("Failed to fetch config: %v\n", err)
		return
	}
	if cfg == "" {
		fmt.Println("No config stored for this key. Please save .env via the web UI first.")
		return
	}

	// Clone repo if missing
	if _, err := os.Stat(targetDir); os.IsNotExist(err) {
		fmt.Printf("Cloning repo to %s...\n", targetDir)
		cmd := exec.Command("git", "clone", repoURL, targetDir)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			fmt.Printf("git clone failed: %v\n", err)
			return
		}
	} else {
		fmt.Printf("Directory %s exists; skipping clone.\n", targetDir)
	}

	envPath := filepath.Join(targetDir, ".env")
	if err := writeEnvFile(cfg, envPath); err != nil {
		fmt.Printf("Failed to write .env: %v\n", err)
		return
	}
	fmt.Printf(".env written to %s\n", envPath)

	fmt.Println("Checking prerequisites...")
	installPrereqs()
	fmt.Println("Prereq check completed.")

	fmt.Println("Starting containers with docker compose up -d ...")
	if err := runComposeUp(targetDir); err != nil {
		fmt.Printf("docker compose failed: %v\n", err)
		return
	}

	fmt.Println("Waiting for services to settle...")
	time.Sleep(5 * time.Second)
	fmt.Println("Installer complete. Verify services at API 3000, embedding 8081, reranker 8082.")
}
