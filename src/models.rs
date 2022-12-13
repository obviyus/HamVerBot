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

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SPFeed {
    pub free: Free,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Free {
    pub data: Data,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Data {
    #[serde(rename = "DR")]
    pub dr: Vec<Dr4>,
    #[serde(rename = "S")]
    pub s: String,
    #[serde(rename = "R")]
    pub r: String,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct F1APIDriverStanding {
    pub position: i8,
    pub driver_name: String,
    pub team_name: String,
    pub time: String,
    pub difference: String,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionResults {
    pub title: String,
    pub standings: Vec<F1APIDriverStanding>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dr4 {
    #[serde(rename = "F")]
    pub f: (String, String, String, String, String, i64),
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Root {
    pub season_context: SeasonContext,
    pub race: Race,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Race {
    pub meeting_country_name: String,
    pub meeting_start_date: String,
    pub meeting_official_name: String,
    pub meeting_end_date: String,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonContext {
    pub timetables: Vec<Timetable>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timetable {
    pub state: String,
    pub session: String,
    pub gmt_offset: String,
    pub description: String,
    pub end_time: String,
    pub start_time: String,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentDriverStandings {
    #[serde(rename = "MRData")]
    pub mrdata: DriversMrdata,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentConstructorStandings {
    #[serde(rename = "MRData")]
    pub mrdata: ConstructorsMrdata,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriversMrdata {
    pub xmlns: String,
    pub series: String,
    pub url: String,
    pub limit: String,
    pub offset: String,
    pub total: String,
    #[serde(rename = "StandingsTable")]
    pub standings_table: DriverStandingsTable,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstructorsMrdata {
    pub xmlns: String,
    pub series: String,
    pub url: String,
    pub limit: String,
    pub offset: String,
    pub total: String,
    #[serde(rename = "StandingsTable")]
    pub standings_table: ConstructorStandingsTable,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverStandingsTable {
    pub season: String,
    #[serde(rename = "StandingsLists")]
    pub standings_lists: Vec<DriverStandingsList>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstructorStandingsTable {
    pub season: String,
    #[serde(rename = "StandingsLists")]
    pub standings_lists: Vec<ConstructorStandingsList>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverStandingsList {
    pub season: String,
    pub round: String,
    #[serde(rename = "DriverStandings")]
    pub driver_standings: Vec<ErgastAPIDriverStanding>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstructorStandingsList {
    pub season: String,
    pub round: String,
    #[serde(rename = "ConstructorStandings")]
    pub constructor_standings: Vec<ConstructorStanding>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ErgastAPIDriverStanding {
    pub position: String,
    pub position_text: String,
    pub points: String,
    pub wins: String,
    #[serde(rename = "Driver")]
    pub driver: Driver,
    #[serde(rename = "Constructors")]
    pub constructors: Vec<Constructor>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Driver {
    pub driver_id: String,
    pub permanent_number: String,
    pub code: String,
    pub url: String,
    pub given_name: String,
    pub family_name: String,
    pub date_of_birth: String,
    pub nationality: String,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Constructor {
    pub constructor_id: String,
    pub url: String,
    pub name: String,
    pub nationality: String,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConstructorStanding {
    pub position: String,
    pub position_text: String,
    pub points: String,
    pub wins: String,
    #[serde(rename = "Constructor")]
    pub constructor: Constructor,
}
