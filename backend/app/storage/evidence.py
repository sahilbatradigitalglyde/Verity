"""Evidence storage in Azure Blob Storage. The browser uploads directly with a short-lived SAS URL."""
from datetime import datetime, timedelta, timezone

from app.core.config import get_settings


def upload_url(blob_name: str, minutes: int = 15) -> str | None:
    s = get_settings()
    if not s.evidence_storage_connection_string:
        return None  # local development: no storage configured, metadata only
    from azure.storage.blob import BlobSasPermissions, BlobServiceClient, generate_blob_sas
    svc = BlobServiceClient.from_connection_string(s.evidence_storage_connection_string)
    sas = generate_blob_sas(account_name=svc.account_name, container_name=s.evidence_container, blob_name=blob_name,
                            account_key=svc.credential.account_key, permission=BlobSasPermissions(create=True, write=True),
                            expiry=datetime.now(timezone.utc) + timedelta(minutes=minutes))
    return f"{svc.url}{s.evidence_container}/{blob_name}?{sas}"


def download_url(blob_name: str, minutes: int = 15) -> str | None:
    s = get_settings()
    if not s.evidence_storage_connection_string:
        return None
    from azure.storage.blob import BlobSasPermissions, BlobServiceClient, generate_blob_sas
    svc = BlobServiceClient.from_connection_string(s.evidence_storage_connection_string)
    sas = generate_blob_sas(account_name=svc.account_name, container_name=s.evidence_container, blob_name=blob_name,
                            account_key=svc.credential.account_key, permission=BlobSasPermissions(read=True),
                            expiry=datetime.now(timezone.utc) + timedelta(minutes=minutes))
    return f"{svc.url}{s.evidence_container}/{blob_name}?{sas}"
