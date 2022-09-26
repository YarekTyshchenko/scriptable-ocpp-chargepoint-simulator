if(!process.env.WS_CONNECT_URL) {
  throw new Error("env variable WS_CONNECT_URL not set!");
}
const connectors = [{
  id: 0
}];
let meterCount = 0;
let cp, heartbeatTimer;
try {
  cp = await connect(process.env.WS_CONNECT_URL);
  // typical startup OCPP
  const bootResp = await cp.sendBootnotification({
    chargePointVendor: "vendor",
    chargePointModel: "1"
  });

  await cp.sendHeartbeat();
  heartbeatTimer = setInterval(() => cp.sendHeartbeat(),
    bootResp.interval > 0 ? bootResp.interval * 1000 : 60000);

  // register code for GetDiagnostics, UpdateFirmware, Reset
  cp.answerGetDiagnostics(async (request) => {
    const fileName = "foo." + new Date().toISOString() + ".txt";
    cp.sendResponse(request.uniqueId, {fileName});
    await cp.sendDiagnosticsStatusNotification({status: "Idle"});
    await cp.sleep(5000);
    await cp.sendDiagnosticsStatusNotification({status: "Uploading"});
    await cp.ftpUploadDummyFile(request.payload.location, fileName);
    await cp.sendDiagnosticsStatusNotification({status: "Uploaded"});
  });
  cp.answerUpdateFirmware( async (request) => {
    cp.sendResponse(request.uniqueId, {});
    await cp.sendFirmwareStatusNotification({status: "Idle"});
    await cp.sleep(5000);
    await cp.sendFirmwareStatusNotification({status: "Downloading"});
    cp.log(`Pretend to download ${request.payload.location}`);
    await cp.sendFirmwareStatusNotification({status: "Downloaded"});
    await cp.sleep(5000);
    await cp.sendFirmwareStatusNotification({status: "Installing"});
    await cp.sleep(5000);
    await cp.sendFirmwareStatusNotification({status: "Installed"});
  });
  cp.answerReset(async (request) => {
    cp.sendResponse(request.uniqueId, {status: "Accepted"});
    cp.log("RESET ***boing-boing-boing*** " + request.payload.type);
    await cp.sendBootnotification({chargePointVendor: "vendor", chargePointModel: "1"});
  });

  // Setup connectors
  await cp.sendStatusNotification(
    {connectorId: 1, errorCode: "NoError", status: "Available"});
  async function chargeCycle(connectorId, tag) {
    cp.log(`Starting charge cycle for Connector ${connectorId}`)

    const authResp = await cp.sendAuthorize({idTag: tag});
    if (authResp.idTagInfo.status !== 'Accepted') {
      cp.log("Not authorised")
      return;
    }

    await cp.sendStatusNotification({
      connectorId: connectorId,
      errorCode: "NoError",
      status: "Preparing"
    });

    cp.transaction = await cp.startTransaction({
      connectorId: connectorId,
      idTag: tag,
      meterStart: meterCount,
      timestamp: new Date().toISOString()
    });

    await cp.sendStatusNotification(
      {connectorId: connectorId, errorCode: "NoError", status: "Charging"});

    for (let chargeMeterCount = 0; chargeMeterCount < 10; chargeMeterCount++) {
      meterCount += 200 + Math.random() * 100;

      await cp.meterValues({
        connectorId: connectorId,
        transactionId: cp.transaction.transactionId,
        meterValue: [{
          timestamp: new Date().toISOString(),
          sampledValue: [{value: `${meterCount}`}]
        }]
      });
      await cp.sleep(5000);
    }
    await cp.stopTransaction({
      transactionId: cp.transaction.transactionId,
      meterStop: meterCount,
      timestamp: new Date().toISOString()
    });

    await cp.sendStatusNotification(
      {connectorId: connectorId, errorCode: "NoError", status: "Finishing"});
    await cp.sendStatusNotification(
      {connectorId: connectorId, errorCode: "NoError", status: "Available"});

    setTimeout(() => chargeCycle(connectorId, tag), 30000 + Math.random() * 30000) // 30-60 seconds
  }
  await chargeCycle(1, "ccc");
  await cp.sleep(99999999);

} catch (err) {
  console.log(err);
} finally {
  clearInterval(heartbeatTimer);
  cp.close();
}
