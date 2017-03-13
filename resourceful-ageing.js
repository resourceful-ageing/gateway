/*
 * Example code of read sensor data of multiple SensorTag (CC2541DK-SENSOR, CC2650STK) at same time by using node-sensortag
 *
 * Node.js 0.10.36 or higher (4.4.2 ready)
 *
 * Usage;
 * $ npm install sensortag async
 * $ node multiple_sensortag.js
 *
 */
var polling_interval = 300000; //ms | NOTE: Interval for polling in periodic

var SensorTag = require('./local_modules/sensortag');
var async = require('async');
var url = require('url');
var macUtil = require('getmac');
var properties = require('properties');
var ibmClient = require('ibmiotf');

var device_timers = {}; // NOTE: Storage for setinterval objects

var mqttService = (function () {
  var client;
  var connected = false;
  var instance;

  function createInstance() {
    var object = {};

    object.connect = function() {

      properties.parse('./config.properties', {path: true}, function(err, cfg) {
        console.log('MQTT: loading credentials');
        if (err) {
          console.error('A file named config.properties containing the device registration from the IBM IoT Cloud is missing.');
          console.error('The file must contain the following properties: org, type, id, auth-token.');
          throw e;
        }
        
        macUtil.getMac(function(err, macAddress) {
          if (err) throw err;
          
          var deviceId = macAddress.replace(/:/gi, '');
          console.log('MQTT: device MAC Address: ' + deviceId);

          if(cfg.id != deviceId) {
            console.warn('The device MAC address does not match the ID in the configuration file.');
          }
          
          var config = {
            "org"   : cfg['org'],
            "type"  : cfg['type'],
            "id"    : cfg['id'],
            "domain": "internetofthings.ibmcloud.com",
            "auth-method" : cfg['auth-method'],
            "auth-token"  : cfg['auth-token'],
            "use-client-certs": false
          };
          
          client = new ibmClient.IotfGateway(config);
          
          client.connect();
          
          client.on('connect', function(){
            console.log('IBM: gateway client connected');
            connected = true;
          });
          
          client.on("error", function (err) {
            console.log('IBM: ' + err);
            connected = false;
            client.connect();
          });
        });
      });
    }
    
    object.isConnected = function() {
      return connected;
    }

    object.getClient = function() {
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

var onDiscover = function(sensorTag) {
  console.info('Sensortag: start discovery');

  sensorTag.once('disconnect', function() {
    clearInterval(device_timers[sensorTag.id]);
    delete(device_timers[sensorTag.id]);
    console.info('Sensortag: ' + sensorTag.id, 'disconnected (' + (Object.keys(device_timers).length) + ' connected)');
  });

  async.series({
    connectAndSetUp: function(next) {
      console.info('Sensortag: ' + sensorTag.id, 'discovered (' + (Object.keys(device_timers).length + 1) + ' connected)');
      sensorTag.connectAndSetUp(function() {
        SensorTag.discover(onDiscover); // NOTE: resume for discover other devices
        next();
      });
    },
    enableSensors: function(next) {
      
      try {
        // environmental data
        sensorTag.enableIrTemperature();
        sensorTag.enableHumidity();
        sensorTag.enableLuxometer();
        sensorTag.enableBarometricPressure();

        // movement data
        sensorTag.setMPU9250Period(100);
        sensorTag.enableAccelerometer();
        sensorTag.enableGyroscope();
        sensorTag.enableMagnetometer();
        
        sensorTag.notifyAccelerometer();
        sensorTag.notifyGyroscope();
        sensorTag.notifyMagnetometer();

      } catch(ex) {
        // NOTE: Ignored because not supported
      }

      console.info('Sensortag: ' + sensorTag.id, 'ready');
      next();
    },
  }, function() {
      // NOTE: In case of polling in periodic
      device_timers[sensorTag.id] = setInterval(function() {
        async.parallel({
          Info: function(next) {
            var info = {id: sensorTag.id, type: sensorTag.type};
            sensorTag._peripheral.updateRssi(function(error, rssi) {
              info.rssi = rssi;
            });
            next(null, info);
          },
          Humidity: function(next) {
            sensorTag.readHumidity(function(error, temperature, humidity) {
              next(null, {temperature: temperature, humidity: humidity});
            });
          },
          Barometer: function(next) {
            try {
              sensorTag.readBarometricPressure(function(error, pressure) {
                next(null, {pressure: pressure});
              });
            } catch(ex) {
              next(); // NOTE: Ignored because not supported
            };
          },
          Luxometer: function(next) {
            try {
              sensorTag.readLuxometer(function(error, lux) {
                next(null, {lux: lux});
              });
            } catch(ex) {
              next(); // NOTE: Ignored because not supported
            };
          }
        }, function(err, data) {
          console.log(data.Info);
          //console.log(JSON.stringify(data));
          
          var newData = {
            "d": {
              "id": data.Info.id,
              "rssi": data.Info.rssi,
              "pressure" : data.Barometer.pressure,
              "humidity" : data.Humidity.humidity,
              "temperature" : data.Humidity.temperature,
              "lux" : data.Luxometer.lux
            }
          };
          if (mqttService.getInstance().isConnected()) {
            mqttService.getInstance().getClient().publishDeviceEvent('sensortag', sensorTag.id, 'air', 'json', JSON.stringify(newData));
          }
        });
      }, polling_interval);


      // NOTE: In case of listening for notification

      sensorTag.on('accelerometerChange', function(x, y, z) {
        if (x != 0 || y != 0 || z != 0) {
          //console.log('accel (id:'+this.id+'x:' + x +", y:" + y + ", z:"+z+")" );
          var newData = {
            "d": {
              "x": x,
              "y": y,
              "z": z
            }
          };
          if (mqttService.getInstance().isConnected()) {
            mqttService.getInstance().getClient().publishDeviceEvent('sensortag', sensorTag.id, 'accel', 'json', JSON.stringify(newData));
          }
        }
      });
      sensorTag.on('gyroscopeChange', function(x, y, z) {
        if (x != 0 || y != 0 || z != 0) {
          //console.log('gyro  (x:' + x +", y:" + y + ", z:"+z+")" );
          var newData = {
            "d": {
              "x": x,
              "y": y,
              "z": z
            }
          };
          if (mqttService.getInstance().isConnected()) {
            mqttService.getInstance().getClient().publishDeviceEvent('sensortag', sensorTag.id, 'gyro', 'json', JSON.stringify(newData));
          }
        }
      });
      sensorTag.on('magnetometerChange', function(x, y, z) {
        if (x != 0 || y != 0 || z != 0) {
          //console.log('magne (x:' + x +", y:" + y + ", z:"+z+")" );
          var newData = {
            "d": {
              "x": x,
              "y": y,
              "z": z
            }
          };
          if (mqttService.getInstance().isConnected()) {
            mqttService.getInstance().getClient().publishDeviceEvent('sensortag', sensorTag.id, 'mag', 'json', JSON.stringify(newData));
          }
        }
      });
    }
  );
};

mqttService.getInstance().connect();
SensorTag.discover(onDiscover);

