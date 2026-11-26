#!/usr/bin/env bash
# Run this script INSIDE Google Cloud Shell (no gcloud installation needed on Mac).
# Creates, starts, stops, or deletes a lightweight GCE Linux dev VM for cloud-only development.
set -euo pipefail

CMD="${1:-help}"
PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
ZONE="${GCP_ZONE:-asia-northeast1-a}"
VM_NAME="${GCP_VM_NAME:-diorama-dev-vm}"
MACHINE_TYPE="${GCP_MACHINE_TYPE:-e2-medium}"

usage() {
  cat <<EOF
Usage (run inside Google Cloud Shell):
  GCP_PROJECT_ID=<your-project> bash cloud/gce-dev-vm.sh <command>

Commands:
  create   Create an Ubuntu 24.04 Spot VM (${MACHINE_TYPE} in ${ZONE}) with Node 22 + Git + gh preinstalled
  ssh      SSH into ${VM_NAME} with local port 8080 forwarded
  stop     Stop ${VM_NAME} (stops compute billing immediately)
  start    Start ${VM_NAME}
  status   Show VM status & external IP
  delete   Delete ${VM_NAME} and its boot disk completely
EOF
}

require_project() {
  if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
    echo "ERROR: Set GCP_PROJECT_ID first, e.g.:"
    echo "  gcloud config set project <YOUR_GCP_PROJECT_ID>"
    exit 1
  fi
}

case "$CMD" in
  create)
    require_project
    echo "Creating Spot dev VM '${VM_NAME}' (${MACHINE_TYPE}) in ${PROJECT_ID}/${ZONE}..."
    gcloud compute instances create "${VM_NAME}" \
      --project="${PROJECT_ID}" \
      --zone="${ZONE}" \
      --machine-type="${MACHINE_TYPE}" \
      --provisioning-model=SPOT \
      --instance-termination-action=STOP \
      --boot-disk-size=20GB \
      --boot-disk-type=pd-balanced \
      --image-family=ubuntu-2404-lts-amd64 \
      --image-project=ubuntu-os-cloud \
      --metadata=startup-script='#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl build-essential python3 gh
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y -qq nodejs
'
    echo "Done! Wait ~60s for startup script, then run: bash cloud/gce-dev-vm.sh ssh"
    ;;
  ssh)
    require_project
    gcloud compute ssh "${VM_NAME}" --project="${PROJECT_ID}" --zone="${ZONE}" -- -L 8080:localhost:8080
    ;;
  stop)
    require_project
    gcloud compute instances stop "${VM_NAME}" --project="${PROJECT_ID}" --zone="${ZONE}"
    ;;
  start)
    require_project
    gcloud compute instances start "${VM_NAME}" --project="${PROJECT_ID}" --zone="${ZONE}"
    ;;
  status)
    require_project
    gcloud compute instances describe "${VM_NAME}" --project="${PROJECT_ID}" --zone="${ZONE}" \
      --format='table(name,status,machineType.basename(),networkInterfaces[0].accessConfigs[0].natIP)'
    ;;
  delete)
    require_project
    gcloud compute instances delete "${VM_NAME}" --project="${PROJECT_ID}" --zone="${ZONE}"
    ;;
  *)
    usage
    ;;
esac
