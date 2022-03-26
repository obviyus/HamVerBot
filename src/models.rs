use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    #[serde(rename = "Meeting")]
    pub meeting: Meeting,
    #[serde(rename = "ArchiveStatus")]
    pub archive_status: ArchiveStatus,
    #[serde(rename = "Key")]
    pub key: i64,
    #[serde(rename = "Type")]
    pub type_field: String,
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "StartDate")]
    pub start_date: String,
    #[serde(rename = "EndDate")]
    pub end_date: String,
    #[serde(rename = "GmtOffset")]
    pub gmt_offset: String,
    #[serde(rename = "Path")]
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Meeting {
    #[serde(rename = "Key")]
    pub key: i64,
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "OfficialName")]
    pub official_name: String,
    #[serde(rename = "Location")]
    pub location: String,
    #[serde(rename = "Country")]
    pub country: Country,
    #[serde(rename = "Circuit")]
    pub circuit: Circuit,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Country {
    #[serde(rename = "Key")]
    pub key: i64,
    #[serde(rename = "Code")]
    pub code: String,
    #[serde(rename = "Name")]
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Circuit {
    #[serde(rename = "Key")]
    pub key: i64,
    #[serde(rename = "ShortName")]
    pub short_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveStatus {
    #[serde(rename = "Status")]
    pub status: String,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SPFeed {
    pub free: Free,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Free {
    pub data: Data,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Data {
    #[serde(rename = "DR")]
    pub dr: Vec<Dr4>,
    #[serde(rename = "S")]
    pub s: String,
    #[serde(rename = "R")]
    pub r: String,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DriverStanding {
    pub position: i8,
    pub driver_name: String,
    pub team_name: String,
    pub time: String,
    pub difference: String,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SessionResults {
    pub title: String,
    pub standings: Vec<DriverStanding>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dr4 {
    #[serde(rename = "F")]
    pub f: (String, String, String, String, String, i64),
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Root {
    pub season_context: SeasonContext,
    pub race: Race,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Race {
    pub meeting_country_name: String,
    pub meeting_start_date: String,
    pub meeting_official_name: String,
    pub meeting_end_date: String,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonContext {
    pub timetables: Vec<Timetable>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timetable {
    pub state: String,
    pub session: String,
    pub gmt_offset: String,
    pub description: String,
    pub end_time: String,
    pub start_time: String,
}
