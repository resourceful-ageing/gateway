var Client = require("ibmiotf");
var appClientConfig = {
    "org" : "6tv4n6",
    "id" : "e4f334ba-e275-483a-8b43-0c51d9efbc94",
    "domain": "internetofthings.ibmcloud.com",
    "auth-key" : "a-6tv4n6-wgxnvgbyhr",
    "auth-token" : "wMA8?KklIsjPEh9SAn"
}


var appClient = new Client.IotfApplication(appClientConfig);

appClient.connect();
 
appClient.on("connect", function () {
    var myData={'DelaySeconds' : 10};
    myData = JSON.stringify(myData);
    appClient.publishDeviceCommand("gateway","b827eb28efa7", "update", "json", myData);
    console.log("send command update"); 
});
