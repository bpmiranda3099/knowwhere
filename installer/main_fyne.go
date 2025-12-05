package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"
	"github.com/google/uuid"
)

// Note: this GUI keeps the same underlying logic as the CLI but surfaces basic steps.

func main() {
	a := app.NewWithID("knowwhere.installer")
	w := a.NewWindow("KnowWhere Installer")
	w.Resize(fyne.NewSize(640, 700))

	apiEntry := widget.NewEntry()
	apiEntry.SetText("https://knowwhere-web.vercel.app")
	keyEntry := widget.NewPasswordEntry()
	repoEntry := widget.NewEntry()
	repoEntry.SetText("https://github.com/bpmiranda3099/knowwhere.git")
	dirEntry := widget.NewEntry()
	dirEntry.SetText("knowwhere")

	status := widget.NewMultiLineEntry()
	status.SetPlaceHolder("Progress output...")
	status.Disable()

	form := &widget.Form{
		Items: []*widget.FormItem{
			{Text: "API base", Widget: apiEntry},
			{Text: "License/API key", Widget: keyEntry},
			{Text: "Repo URL", Widget: repoEntry},
			{Text: "Target directory", Widget: dirEntry},
		},
		OnSubmit: func() {
			go func() {
				log := func(s string) {
					status.SetText(status.Text + s + "\n")
				}
				apiBase := apiEntry.Text
				apiKey := keyEntry.Text
				repoURL := repoEntry.Text
				targetDir := dirEntry.Text
				if apiBase == "" || apiKey == "" {
					log("API base and key required")
					return
				}
				machineID := uuid.NewString()

				log("Validating license...")
				if err := validateLicense(apiBase, apiKey, machineID); err != nil {
					log(fmt.Sprintf("License validation failed: %v", err))
					return
				}
				log("License OK.")

				log("Fetching config...")
				cfg, err := fetchConfigByKey(apiBase, apiKey)
				if err != nil {
					log(fmt.Sprintf("Fetch config failed: %v", err))
					return
				}
				if cfg == "" {
					log("No config stored for this key/global. Save .env first.")
					return
				}

				// Clone if missing
				if _, err := os.Stat(targetDir); os.IsNotExist(err) {
					log("Cloning repo...")
					cmd := exec.Command("git", "clone", repoURL, targetDir)
					out, err := cmd.CombinedOutput()
					if err != nil {
						log(fmt.Sprintf("git clone failed: %v: %s", err, string(out)))
						return
					}
				} else {
					log("Target dir exists; skipping clone.")
				}

				envPath := filepath.Join(targetDir, ".env")
				if err := os.WriteFile(envPath, []byte(cfg), 0600); err != nil {
					log(fmt.Sprintf("write .env failed: %v", err))
					return
				}
				log("Wrote .env")

				log("Checking/installing prerequisites...")
				installPrereqs()
				log("Prereq step complete.")

				log("Running docker compose up -d ...")
				if err := runComposeUp(targetDir); err != nil {
					log(fmt.Sprintf("compose failed: %v", err))
					return
				}
				log("Containers started. Waiting briefly for health...")
				time.Sleep(5 * time.Second)
				log("Done. Check API 3000, embedding 8081, reranker 8082.")
			}()
		},
	}

	content := container.NewVBox(
		widget.NewLabelWithStyle("KnowWhere Installer", fyne.TextAlignCenter, fyne.TextStyle{Bold: true}),
		widget.NewLabel("Enter your API base and license key, then Install. Repo will be cloned if missing."),
		form,
		widget.NewButton("View EULA / License", func() {
			dialog.ShowInformation("License", "MIT License. Use at your own risk. No liability for data loss or damage.\n\nPrereqs: Docker/Compose, Git. Windows: auto via winget; Linux: auto via apt/dnf/yum.\nAPI keys: master in saved config, user key for validation.", w)
		}),
		widget.NewLabel("Progress:"),
		status,
	)

	w.SetContent(content)
	w.ShowAndRun()
}

// --- existing logic reused below ---

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

func commandExists(cmd string) bool {
	_, err := exec.LookPath(cmd)
	return err == nil
}

func installPrereqs() {
	switch runtime.GOOS {
	case "windows":
		if !commandExists("docker") {
			tryRun("winget", "install", "--id=Docker.DockerDesktop", "-e", "--accept-source-agreements", "--accept-package-agreements")
		}
		if !commandExists("git") {
			tryRun("winget", "install", "--id=Git.Git", "-e", "--accept-source-agreements", "--accept-package-agreements")
		}
	case "linux":
		installPrereqsLinux()
	default:
	}
}

func tryRun(cmd string, args ...string) {
	if !commandExists(cmd) {
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
		return
	}
	tryRun("sudo", pkgMgr, "update")
	switch pkgMgr {
	case "apt", "apt-get":
		if !commandExists("docker") {
			tryRun("sudo", pkgMgr, "install", "-y", "docker.io")
		}
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
