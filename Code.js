// load sheet ids
const { SHEETS_ID } = PropertiesService.getScriptProperties().getProperties();
const parsed_ids = JSON.parse(SHEETS_ID);

const max_date_range = 52;
const default_benchmark_values = {
  standard_benchmark: 1.62,
  layout_benchmark: 0.65,
  edit_benchmark: 0.69,
};

// FUNCTIONS

// required function to load as Web App
function doGet(e) {
  var email = Session.getActiveUser().getEmail();
  var auth = isValidEmail(email);
  var html = auth
    ? HtmlService.createTemplateFromFile("index.html").evaluate()
    : HtmlService.createTemplateFromFile("401.html").evaluate();
  return html;
}

function getIndividualSheetData(props) {
  const { sheetID, sheetName, startCol, endCol, skip, checkDate } = props;
  var ss = SpreadsheetApp.openById(sheetID).getSheetByName(sheetName);
  var start_index = getColumnFromName(ss, startCol, skip);
  var end_index;
  if (endCol) {
    end_index = getColumnFromName(ss, endCol);
  } else {
    end_index = ss.getLastColumn();
  }
  var last_row = ss
    .getRange(ss.getMaxRows(), start_index)
    .getNextDataCell(SpreadsheetApp.Direction.UP)
    .getRow();
  var sheet = ss.getRange(1, start_index, last_row, end_index).getValues();
  if (checkDate) {
    // Spreadsheet App doesnt always detect last row, will run a JS filter for extra scrutiny
    var headers = sheet.shift();
    sheet = sheet.filter((row) => {
      const value = row[start_index - 1];
      return value instanceof Date;
    });
    sheet.unshift(headers);
  }
  return sheet;
}

// email validation
function isValidEmail(email) {
  var { WHITELIST } = PropertiesService.getScriptProperties().getProperties();
  var parsedList = JSON.parse(WHITELIST);
  const isValid = parsedList.indexOf(email.toLowerCase());
  return isValid !== -1 ? true : false;
}

// we want to revamp the metrics databse
// get 2020 until 2023 data
// combine and filter both sheets

function getMetricData() {
  const metric_sheet_names = ["Metrics - 2021", "Metrics - 2022", "Metrics - 2023"];
  var designer_data = [], ramp_data, num_tickets_ramp;
  
  metric_sheet_names.forEach((name, idx) => {
    // fetch the data
    var data = getIndividualSheetData({
    sheetID: parsed_ids.designerDB,
    sheetName: name,
    startCol: "Date",
    checkDate: true,
    });

    // trim header column if not index 0, this is to ensure we only have one "set" of header column
    if (idx !== 0) {
      data.shift();
    }
    // append data to designer_data
    designer_data = designer_data.concat(data);
  });
  // convert raw data array into a JS object
  designer_data = sheetToObj(designer_data);

  // Retrieve Ramp values for metrics and number of tickets
  var { RAMP_DATA } = PropertiesService.getScriptProperties().getProperties();
  var { NUM_TICKETS_RAMP } =
    PropertiesService.getScriptProperties().getProperties();
   
  ramp_data = JSON.parse(RAMP_DATA);
  num_tickets_ramp = JSON.parse(NUM_TICKETS_RAMP);

  return { designer_data, ramp_data, num_tickets_ramp };
}

/** Old method to get the metrics data, keep as a reference */
// function getMetricData() {
//   var data_2021 = getIndividualSheetData({
//     sheetID: parsed_ids.designerDB,
//     sheetName: "Metrics - 2021",
//     startCol: "Date",
//     checkDate: true,
//   });
//   var data_2022 = getIndividualSheetData({
//     sheetID: parsed_ids.designerDB,
//     sheetName: "Metrics - 2022",
//     startCol: "Date",
//     checkDate: true,
//   });
//   var { RAMP_DATA } = PropertiesService.getScriptProperties().getProperties();
//   var { NUM_TICKETS_RAMP } =
//     PropertiesService.getScriptProperties().getProperties();

//   // trim header for 2021 data
//   data_2022.shift();
//   // combine the two arrays
//   let designer_data = data_2021.concat(data_2022);
//   designer_data = sheetToObj(designer_data);
//   const ramp_data = JSON.parse(RAMP_DATA);
//   const num_tickets_ramp = JSON.parse(NUM_TICKETS_RAMP);

//   return { designer_data, ramp_data, num_tickets_ramp };
// }


/////////////////////////////////////////////////
// BEAMD Data getter and data cruncher functions
/////////////////////////////////////////////////
function getBeamData() {
  var beamData = getIndividualSheetData({
    sheetID: parsed_ids.designerDB,
    sheetName: "BEAMD",
    startCol: "BEAMer",
    checkDate: false,
  });
  beamData = sheetToObj(beamData);
  // Only using data that contains BEAM information
  // beamData = beamData.filter(
  //   (item) => item["Does it adhere to the BRAND?"] !== ""
  // );

  // need a method to handle BEAM portion
  // need a method to handle Design portion
  return crunchBEAMData(beamData);
}

// The purpose of this function is to crunch the Beam data, we want it to be matching the Designer Comparison sheet
function crunchBEAMData(data) {
  // const names of original column keys
  var B = "Does it adhere to the BRAND?";
  var E = "Do you want to ENGAGE with this ad?";
  var A = "How much does this ad grab your ATTENTION?";
  var M = "Is there a clear MESSAGE?";
  var D = "How is the DESIGN of this ad?";
  var ID = "ClickUp Task ID";
  var filtered_BEAMD = {};
  var raw_data = [];
  var total_scores = {
    B: 0,
    E: 0,
    A: 0,
    M: 0,
    D: 0,
  };
  // create array with individual Designer names
  var set = [...new Set(data.map((item) => item["Designer"]))];
  // remove unwanted ERROR values
  set.splice(set.indexOf("#N/A"), 1);
  // filter out empty name fields
  set = set.filter((item) => item.length > 2);

  set.forEach((name) => {
    // counter to be used to calculate average
    var counter = 0;
    var designCounter = 0;
    var scores = {
      B: 0,
      E: 0,
      A: 0,
      M: 0,
      D: 0,
    };
    var designer_data = [];
    data.forEach((item) => {
      var tempObj = {};
      if (item["Designer"] === name) {
        // check if it's a Design only row
        if (
          item[D] !== "" &&
          item[B] === "" &&
          item[E] === "" &&
          item[A] === "" &&
          item[M] === ""
        ) {
          // We have a Design only entry
          var improveArr =
            item["What could be improved in this ad? [Select Any]"];
          if (improveArr.length > 0) {
            improveArr = improveArr.split(", ");
            improveArr = improveArr.filter((item) => item !== "Ticket");
          }
          scores.D += +item[D];
          tempObj["date"] = item["Ticket Completion Date"];
          tempObj["designer"] = item["Designer"];
          tempObj["D"] = +item[D];
          tempObj["improvements"] = improveArr;
          tempObj["gallery"] = item["Gallery Link"];
          tempObj["isDesignOnly"] = true;
          tempObj["id"] = item[ID];

          if (item["This ad has exceptional [Select Any]"].length > 0) {
            isExceptional = true;
            tempObj["isExceptional"] = true;
            tempObj["exceptional"] =
              item["This ad has exceptional [Select Any]"];
          } else {
            tempObj["isExceptional"] = false;
          }

          designer_data.push(tempObj);

          designCounter++;
          // else if look for data row that contains BEAM data as well
        } else {
          var improveArr =
            item["What could be improved in this ad? [Select Any]"];
          if (improveArr.length > 0) {
            improveArr = improveArr.split(", ");
            improveArr = improveArr.filter((item) => item !== "Ticket");
          }
          scores.B += item[B] !== "" ? +item[B] : 0;
          scores.E += item[E] !== "" ? +item[E] : 0;
          scores.A += item[A] !== "" ? +item[A] : 0;
          scores.M += item[M] !== "" ? +item[M] : 0;
          scores.D += item[D] !== "" ? +item[D] : 0;

          tempObj["date"] = item["Ticket Completion Date"];
          tempObj["designer"] = item["Designer"];
          tempObj["B"] = item[B] !== "" ? +item[B] : 0;
          tempObj["E"] = item[E] !== "" ? +item[E] : 0;
          tempObj["A"] = item[A] !== "" ? +item[A] : 0;
          tempObj["M"] = item[M] !== "" ? +item[M] : 0;
          tempObj["D"] = item[D] !== "" ? +item[D] : 0;
          tempObj["improvements"] = improveArr;
          tempObj["gallery"] = item["Gallery Link"];
          tempObj["id"] = item[ID];
          tempObj["isDesignOnly"] = false;

          // for each designer, adding individual row data so we can use filter by date later on

          if (item["This ad has exceptional [Select Any]"].length > 0) {
            tempObj["isExceptional"] = true;
            tempObj["exceptional"] =
              item["This ad has exceptional [Select Any]"];
          } else {
            tempObj["isExceptional"] = false;
          }
          designer_data.push(tempObj);
          counter++;
          designCounter++;
        }
      }
    });
    // calculate average
    for (key in scores) {
      if (key === "D") {
        var value =
          Math.round((scores[key] / designCounter + Number.EPSILON) * 100) /
          100;
        scores[key] = !isNaN(value) ? value : 0;
      } else {
        var value =
          Math.round((scores[key] / counter + Number.EPSILON) * 100) / 100;
        scores[key] = !isNaN(value) ? value : 0;
      }
    }
    filtered_BEAMD[name] = {
      scores: scores,
    };
    raw_data.push(...designer_data);
  });

  var beamScoreCounter = {
    B: 0,
    E: 0,
    A: 0,
    M: 0,
    D: 0,
  };

  // Now that we have the averages for All Designers, we can find the Team total
  for (key in filtered_BEAMD) {
    var current = filtered_BEAMD[key].scores;
    for (letter in current) {
      if (current[letter] > 0) {
        total_scores[letter] += current[letter];
        beamScoreCounter[letter]++;
      }
    }
  }

  for (key in total_scores) {
    total_scores[key] =
      Math.round(
        (total_scores[key] / beamScoreCounter[key] + Number.EPSILON) * 100
      ) / 100;
  }

  filtered_BEAMD["Team"] = {
    scores: total_scores,
  };

  // Raw Data
  // Sort by date
  raw_data.sort((a, b) => new Date(b.date) - new Date(a.date));

  filtered_BEAMD["ALL_DATA"] = {
    designer_data: raw_data,
  };

  // for (key in filtered_BEAMD) {
  //   Logger.log(key)
  //   Logger.log(filtered_BEAMD[key])
  // };

  return filtered_BEAMD;
}
