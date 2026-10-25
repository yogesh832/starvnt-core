"""One-time setup, run by the company account owner from Mumbai CloudShell."""
import json
from pathlib import Path
import boto3

ACCOUNT = "089366939966"
INSTANCE = "i-050ba337d9d81dd2c"
REGION = "ap-south-1"
ROOT = Path(__file__).resolve().parent
assert boto3.client("sts").get_caller_identity()["Account"] == ACCOUNT
iam = boto3.client("iam")
ec2 = boto3.client("ec2", region_name=REGION)
ssm = boto3.client("ssm", region_name=REGION)

def read(name):
    return (ROOT / name).read_text()

# Fail instead of overwriting existing security configuration on a repeated run.
for name in ("starvnt-production-ssm", "starvnt-github-main-deploy"):
    try:
        iam.get_role(RoleName=name)
    except iam.exceptions.NoSuchEntityException:
        pass
    else:
        raise RuntimeError(f"Role {name} already exists; inspect before changing it")
associations = ec2.describe_iam_instance_profile_associations(
    Filters=[{"Name": "instance-id", "Values": [INSTANCE]}]
)["IamInstanceProfileAssociations"]
assert not associations, "Instance already has a role; inspect before changing it"

provider_arn = f"arn:aws:iam::{ACCOUNT}:oidc-provider/token.actions.githubusercontent.com"
providers = iam.list_open_id_connect_providers()["OpenIDConnectProviderList"]
if not any(p["Arn"] == provider_arn for p in providers):
    iam.create_open_id_connect_provider(
        Url="https://token.actions.githubusercontent.com",
        ClientIDList=["sts.amazonaws.com"],
        Tags=[{"Key": "Application", "Value": "starvnt-production"}],
    )

iam.create_role(RoleName="starvnt-production-ssm", AssumeRolePolicyDocument=read("ec2-trust.json"))
iam.put_role_policy(RoleName="starvnt-production-ssm", PolicyName="SSMAgentMessaging", PolicyDocument=read("ec2-ssm-policy.json"))
iam.create_instance_profile(InstanceProfileName="starvnt-production-ssm")
iam.add_role_to_instance_profile(InstanceProfileName="starvnt-production-ssm", RoleName="starvnt-production-ssm")
iam.create_role(RoleName="starvnt-github-main-deploy", AssumeRolePolicyDocument=read("github-trust.json"), MaxSessionDuration=3600)
iam.put_role_policy(RoleName="starvnt-github-main-deploy", PolicyName="DeployThisInstanceOnly", PolicyDocument=read("github-policy.json"))
ssm.create_document(Name="StarvntDeployMain", Content=read("ssm-document.json"), DocumentType="Command", DocumentFormat="JSON")
print("OIDC provider, scoped roles, instance profile and deployment document created.")
print("After IAM propagation, associate instance profile starvnt-production-ssm with " + INSTANCE)
