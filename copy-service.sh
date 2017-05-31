#!/usr/bin/env bash

set -e
set -u

systemctl stop resourceful-gateway.service
cp resourceful-gateway.service /etc/systemd/system/.
systemctl daemon-reload
sleep 10
systemctl start resourceful-gateway.service

