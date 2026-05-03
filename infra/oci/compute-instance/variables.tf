variable "tenancy_ocid" {
  type        = string
  description = "OCI tenancy OCID."
}

variable "user_ocid" {
  type        = string
  description = "OCI user OCID."
}

variable "fingerprint" {
  type        = string
  description = "API key fingerprint."
}

variable "private_key_path" {
  type        = string
  description = "Path to your OCI API private key (PEM)."
}

variable "region" {
  type        = string
  description = "OCI region identifier, e.g. ap-singapore-1."
}

variable "compartment_ocid" {
  type        = string
  description = "Compartment OCID where the instance will be created."
}

variable "subnet_ocid" {
  type        = string
  description = "Existing subnet OCID (your public subnet)."
}

variable "instance_name" {
  type        = string
  description = "Compute instance display name."
  default     = "knowwhere-demo"
}

variable "shape" {
  type        = string
  description = "Compute shape."
  default     = "VM.Standard.A1.Flex"
}

variable "ocpus" {
  type        = number
  description = "OCPUs for Flex shapes."
  default     = 1
}

variable "memory_in_gbs" {
  type        = number
  description = "Memory (GB) for Flex shapes."
  default     = 6
}

variable "assign_public_ip" {
  type        = bool
  description = "Assign a public IPv4 address to the primary VNIC."
  default     = true
}

variable "ssh_authorized_keys" {
  type        = string
  description = "SSH public key content (e.g. contents of ~/.ssh/id_rsa.pub)."
}

variable "operating_system" {
  type        = string
  description = "Image operating system name used for lookup."
  default     = "Oracle Linux"
}

variable "operating_system_version" {
  type        = string
  description = "Image OS version used for lookup."
  default     = "9"
}

