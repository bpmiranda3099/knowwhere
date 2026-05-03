# OCI compute instance (Terraform)

Creates **only** a Compute instance, attaching it to an **existing subnet** (your VCN/subnet/IGW/route tables are assumed to already exist).

OCI requires an Availability Domain for instance placement; this stack **auto-selects the first AD** returned by the Identity API for your region.

## Usage

1. Install Terraform.
2. Create a `terraform.tfvars` file (copy from `terraform.tfvars.example`):

```hcl
tenancy_ocid     = "ocid1.tenancy.oc1..."
user_ocid        = "ocid1.user.oc1..."
fingerprint      = "aa:bb:cc:..."
private_key_path = "/absolute/path/to/oci_api_key.pem"
region           = "ap-singapore-1"

compartment_ocid = "ocid1.compartment.oc1..."
subnet_ocid      = "ocid1.subnet.oc1..."

instance_name = "knowwhere-demo"
shape         = "VM.Standard.A1.Flex"
ocpus         = 1
memory_in_gbs = 6

assign_public_ip     = true
ssh_authorized_keys  = "ssh-rsa AAAA... your_key_comment"

operating_system         = "Oracle Linux"
operating_system_version = "9"
```

3. Apply:

```bash
terraform init
terraform apply
```

## Outputs

- `public_ip`: SSH target and public endpoint IP (if `assign_public_ip=true`)
- `private_ip`: VCN private IP

