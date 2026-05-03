output "instance_id" {
  value       = oci_core_instance.this.id
  description = "OCID of the created instance."
}

output "availability_domain" {
  value       = oci_core_instance.this.availability_domain
  description = "Availability Domain used (auto-selected)."
}

output "public_ip" {
  value       = data.oci_core_vnic.primary.public_ip_address
  description = "Public IPv4 address (if assigned)."
}

output "private_ip" {
  value       = data.oci_core_vnic.primary.private_ip_address
  description = "Private IPv4 address."
}

