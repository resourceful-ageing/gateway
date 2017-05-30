# resourceful-ageing

## Installation

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
```

