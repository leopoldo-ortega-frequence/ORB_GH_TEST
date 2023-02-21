// Helper Utility GS functions go here

// Gets all data and formats it to a JS friendly format
function sheetToObj(data) {
  // in order to use this for d3, we need to convert the raw data into an Array of Objects
  var objName = data[0];
  // create an empty object
  var formattedData = [];
  // start at 1 skip Headers
  for (var i = 1; i < data.length; i++) {
    var rowData = data[i];
    var newObj = {};
    for (var j = 0; j < rowData.length; j++) {
      var value = rowData[j];
      // cannot send Sheet Date to client, must format
      if (value instanceof Date) {
        value = value.toLocaleDateString("en-US");
      }
      // checking if we need to round numbers with large decimal places
      if (typeof value === "number") {
        var stringed = String(value);
        if (stringed.length > 4) {
          value = Math.round(value * 100) / 100;
        }
      }
      newObj[objName[j]] = value;
    }
    formattedData.push(newObj);
  }
  return formattedData;
}

// returns ONLY the headers from the selected sheet
function getColumnFromName(sheet, name, skip) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var i = skip ? skip : 0; i < headers.length; i++) {
    if (headers[i] == name) return i + 1;
  }
  return -1;
}
