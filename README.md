# resourceful-ageing

## Installation
An old version of nodejs is required, namely v0.10.33.
`nvm` is recommended to install it.

### Install dependencies

```shell
npm install
```

### Add IBM config

```shell
ifconfig
nano config.properties
```

## Usage

```shell
npm start
```

## Running as a systemd service

```
cp resourceful-gateway.service /etc/systemd/system/.
systemctl enable resourceful-gateway.service
systemctl start resourceful-gateway.service

# journalctl is used to view the logs
journalctl -u resourceful-gateway.service

# or to watch it
watch 'journalctl -u resourceful-gateway.service  | tail -40'
```

