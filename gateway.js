"use strict";

var shell = require('shelljs');
var SensorTag = require('sensortag');
var async = require('async');
var macUtil = require('getmac');
var properties = require('properties');
var ibmClient = require('ibmiotf');
var moment = require('moment-timezone');
moment.tz.setDefault('Europe/Amsterdam');

var polling_interval = 60000; // ms
var movement_frequency = 200; // ms
var device_timers = {}; // NOTE: Storage for setinterval objects
var devices = {};

// allow duplicates to enable reconnect
SensorTag.SCAN_DUPLICATES = true;

var mqttService = (function () {
  var client;
  var connected = false;
  var instance;

  function createInstance() {
    var object = {};

    object.connect = function () {

      properties.parse('./config.properties', { path: true }, function (err, cfg) {
        console.log('MQTT: loading credentials');
        if (err) {
          console.error('A file named config.properties containing the device registration from the IBM IoT Cloud is missing.');
          console.error('The file must contain the following properties: org, type, id, auth-token.');
          throw err;
        }

        macUtil.getMac(function (err, macAddress) {
          if (err) throw err;

          var deviceId = macAddress.replace(/:/gi, '');
          console.log('MQTT: device MAC Address: ' + deviceId);

          if (cfg.id != deviceId) {
            console.warn('The device MAC address does not match the ID in the configuration file.');
          }

          var config = {
            "org": cfg['org'],
            "type": cfg['type'],
            "id": cfg['id'],
            "domain": "internetofthings.ibmcloud.com",
            "auth-method": cfg['auth-method'],
            "auth-token": cfg['auth-token'],
            "use-client-certs": false
          };

          client = new ibmClient.IotfGateway(config);

          client.connect();

          client.on('connect', function () {
            console.log('IBM: gateway client connected');
            connected = true;

            client.subscribeToGatewayCommand('reboot-gateway');
            client.subscribeToGatewayCommand('update-gateway');
            client.subscribeToGatewayCommand('list-sensors');
          });

          client.on('command', function (type, id, commandName, commandFormat, payload, topic) {
            switch (commandName) {
              case 'reboot-gateway':
                shell.exec('reboot');
                break;
              case 'update-gateway':
                if (shell.exec('sudo git reset --hard').code === 0) {
                  console.log('updated, send event');
                  client.publishDeviceEvent("sensortag", deviceId, "gateway-updated", "json", {});
                }
                break;
              case 'list-sensors':

                console.log('return list of sensors (' + Object.keys(devices).length + ' connected devices)');
                console.log(devices);
                client.publishDeviceEvent("sensortag", deviceId, "sensors-listed", "json", { "devices": JSON.stringify(devices) });
                break;
            }
          });

          client.on("error", function (err) {
            console.log('IBM: ' + err);
            connected = false;
          });
        });
      });
    }

    object.isConnected = function () {
      return connected;
    }

    object.getClient = function () {
      return client;
    }

    return object;
  }

  return {
    getInstance: function () {
      if (!instance) {
        instance = createInstance();
      }
      return instance;
    }
  };
})();

var onDiscover = function (sensorTag) {
  console.info('Sensortag: start discovery');

  sensorTag.once('disconnect', function () {
    clearInterval(device_timers[sensorTag.id]);
    delete (device_timers[sensorTag.id]);
    delete (devices[sensorTag.id]);
    console.info('Sensortag: ' + sensorTag.id + ' disconnected (' + Object.keys(devices).length + ' connected)');
  });

  async.series({
    connectAndSetUp: function (next) {
      console.info('Sensortag: ' + sensorTag.id + ' discovered');
      sensorTag.connectAndSetUp(function () {
        SensorTag.discover(onDiscover);
        next();
      });
    },
    enableSensors: function (next) {

      try {
        // environmental data
        sensorTag.enableIrTemperature();
        sensorTag.enableHumidity();
        sensorTag.enableLuxometer();
        sensorTag.enableBarometricPressure();

        // movement data
        sensorTag.setMPU9250Period(movement_frequency);
        sensorTag.enableAccelerometer();
        sensorTag.enableGyroscope();
        sensorTag.enableMagnetometer();

        sensorTag.notifyAccelerometer();
        sensorTag.notifyGyroscope();
        sensorTag.notifyMagnetometer();

        devices[sensorTag.id] = moment().unix();
        console.info('Sensortag: ' + sensorTag.id + ' ready (' + Object.keys(devices).length + ' connected)');

      } catch (ex) {
        // NOTE: Ignored because not supported
      }
      next();
    },
  }, function () {
    setTimeout(function () {
      // NOTE: In case of polling in periodic
      if(devices[sensorTag.id])
      {
		    //console.log('Device is present. We scan!');
	    }
	    else
	    {
		    console.log('Spurious timer! Device is not present. We do not scan!');
		    return; //No device. It was disconnected in the timer
	    }
      
      device_timers[sensorTag.id] = setInterval(function () {
        async.parallel({
          Info: function (next) {
            var info = { id: sensorTag.id, type: sensorTag.type };
            sensorTag._peripheral.updateRssi(function (error, rssi) {
              info.rssi = rssi;
            });
            next(null, info);
          },
          Humidity: function (next) {
            sensorTag.readHumidity(function (error, temperature, humidity) {
              next(null, { temperature: temperature, humidity: humidity });
            });
          },
          Barometer: function (next) {
            try {
              sensorTag.readBarometricPressure(function (error, pressure) {
                next(null, { pressure: pressure });
              });
            } catch (ex) {
              next(); // NOTE: Ignored because not supported
            };
          },
          Luxometer: function (next) {
            try {
              sensorTag.readLuxometer(function (error, lux) {
                next(null, { lux: lux });
              });
            } catch (ex) {
              next(); // NOTE: Ignored because not supported
            };
          },
          Battery: function (next) {
            try {
              sensorTag.readBatteryLevel(function (error, batteryLevel) {
                next(null, { battery: batteryLevel });
              });
            } catch (ex) {
              next();
            };
          }
          //	  Io: function(next) {
          //	    try {
          //	      sensorTag.readIoConfig(function(error, value) {
          //	        next(null, {io: value});
          //	      });
          //	    } catch(ex) {
          //	      next();
          //	    };
          //	  }
        }, function (err, data) {

          var newData = {
            "d": {
              "rssi": data.Info.rssi,
              "pressure": data.Barometer.pressure,
              "humidity": data.Humidity.humidity,
              "temperature": data.Humidity.temperature,
              "lux": data.Luxometer.lux,
              "battery": data.Battery.battery
              // "io": data.Io.io
            }
          };
          console.log(newData);
          devices[sensorTag.id] = moment().unix();

          if (mqttService.getInstance().isConnected()) {
            mqttService.getInstance().getClient().publishDeviceEvent('sensortag', sensorTag.id, 'air', 'json', JSON.stringify(newData));
          }
        });
      }, polling_interval);

      // NOTE: In case of listening for notification

      sensorTag.on('accelerometerChange', function (x, y, z) {
        if (x != 0 || y != 0 || z != 0) {
          var newData = {
            "d": {
              "x": x,
              "y": y,
              "z": z
            }
          };
          //console.log(sensorTag.id);
          console.log(newData);

          if (mqttService.getInstance().isConnected()) {
            devices[sensorTag.id] = moment().unix();
            mqttService.getInstance().getClient().publishDeviceEvent('sensortag', sensorTag.id, 'accel', 'json', JSON.stringify(newData));
          }
        }
      });
      sensorTag.on('gyroscopeChange', function (x, y, z) {
        if (x != 0 || y != 0 || z != 0) {
          var newData = {
            "d": {
              "x": x,
              "y": y,
              "z": z
            }
          };
          if (mqttService.getInstance().isConnected()) {
            devices[sensorTag.id] = moment().unix();
            mqttService.getInstance().getClient().publishDeviceEvent('sensortag', sensorTag.id, 'gyro', 'json', JSON.stringify(newData));
          }
        }
      });
      sensorTag.on('magnetometerChange', function (x, y, z) {
        if (x != 0 || y != 0 || z != 0) {
          var newData = {
            "d": {
              "x": x,
              "y": y,
              "z": z
            }
          };
          if (mqttService.getInstance().isConnected()) {
            devices[sensorTag.id] = moment().unix();
            mqttService.getInstance().getClient().publishDeviceEvent('sensortag', sensorTag.id, 'mag', 'json', JSON.stringify(newData));
          }
        }
      });
    }, 12000);
  }
  );
};

mqttService.getInstance().connect();
SensorTag.discover(onDiscover);
