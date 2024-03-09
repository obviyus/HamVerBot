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

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriverList {
    #[serde(rename = "BroadcastName")]
    pub broadcast_name: String,
    #[serde(rename = "CountryCode")]
    pub country_code: String,
    #[serde(rename = "FirstName")]
    pub first_name: String,
    #[serde(rename = "FullName")]
    pub full_name: String,
    #[serde(rename = "LastName")]
    pub last_name: String,
    #[serde(rename = "Line")]
    pub line: i64,
    #[serde(rename = "RacingNumber")]
    pub racing_number: String,
    #[serde(rename = "Reference")]
    pub reference: String,
    #[serde(rename = "TeamColour")]
    pub team_color: String,
    #[serde(rename = "TeamName")]
    pub team_name: String,
    #[serde(rename = "Tla")]
    pub tla: String,
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
    pub difference: Option<String>,
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
pub struct EventTracker {
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

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvents {
    pub races: Vec<CalendarRace>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarRace {
    pub name: String,
    pub location: String,
    pub latitude: f64,
    pub longitude: f64,
    pub round: i64,
    pub slug: String,
    pub locale_key: String,
    pub tbc: Option<bool>,
    pub sessions: Sessions,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sessions {
    pub fp1: String,
    pub fp2: Option<String>,
    pub fp3: Option<String>,
    pub gp: String,
    pub qualifying: String,
    pub sprint: Option<String>,
    pub sprint_qualifying: Option<String>,
}

impl Sessions {
    pub fn iter(&self) -> Vec<(&str, String)> {
        let mut fields = Vec::new();

        fields.push(("fp1", self.fp1.clone()));

        if let Some(ref fp2) = self.fp2 {
            fields.push(("fp2", fp2.clone()));
        }

        if let Some(ref fp3) = self.fp3 {
            fields.push(("fp3", fp3.clone()));
        }

        fields.push(("qualifying", self.qualifying.clone()));
        fields.push(("gp", self.gp.clone()));

        if let Some(ref sprint) = self.sprint {
            fields.push(("sprint", sprint.clone()));
        }

        if let Some(ref sprint_qualifying) = self.sprint_qualifying {
            fields.push(("sprint_qualifying", sprint_qualifying.clone()));
        }

        fields
    }
}
