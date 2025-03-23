// F1 API Models

// Driver model
export interface Driver {
	racingNumber: number;
	reference: string;
	firstName: string;
	lastName: string;
	fullName: string;
	broadcastName: string;
	tla: string;
	teamName: string;
	teamColor: string;
}

// Session Info model
export interface SessionInfo {
	archiveStatus: {
		status: string;
	};
	endDate: string;
	gmtOffset: string;
	key: number;
	meeting: {
		circuit: {
			key: number;
			shortName: string;
		};
		country: {
			code: string;
			key: number;
			name: string;
		};
		key: number;
		location: string;
		name: string;
		number: number;
		officialName: string;
	};
	name: string;
	number: number;
	path: string;
	startDate: string;
	type: string;
}

// Driver Standing model
export interface DriverStanding {
	position: number;
	driverName: string;
	teamName: string;
	time: string;
	difference?: string;
}

// Session Results model
export interface SessionResults {
	title: string;
	standings: DriverStanding[];
}

// Event Tracker model
export interface EventTracker {
	race: {
		meetingOfficialName: string;
	};
	seasonContext: {
		timetables: Array<{
			description: string;
			state: string;
			startTime: string;
			gmtOffset: string;
		}>;
	};
}

// Ergast API Models

// Ergast Driver model
export interface ErgastDriver {
	driverId: string;
	permanentNumber: string;
	code: string;
	url: string;
	givenName: string;
	familyName: string;
	dateOfBirth: string;
	nationality: string;
}

// Constructor model
export interface Constructor {
	constructorId: string;
	url: string;
	name: string;
	nationality: string;
}

// Ergast Driver Standing model
export interface ErgastDriverStanding {
	position: string;
	positionText: string;
	points: string;
	wins: string;
	Driver: ErgastDriver;
	Constructors: Constructor[];
}

// Constructor Standing model
export interface ConstructorStanding {
	position: string;
	positionText: string;
	points: string;
	wins: string;
	Constructor: Constructor;
}

// Standings Lists
export interface DriverStandingsList {
	season: string;
	round: string;
	DriverStandings: ErgastDriverStanding[];
}

export interface ConstructorStandingsList {
	season: string;
	round: string;
	ConstructorStandings: ConstructorStanding[];
}

// Standings Tables
export interface DriverStandingsTable {
	season: string;
	StandingsLists: DriverStandingsList[];
}

export interface ConstructorStandingsTable {
	season: string;
	StandingsLists: ConstructorStandingsList[];
}

// MRData models
export interface DriverMRData {
	xmlns: string;
	series: string;
	url: string;
	limit: string;
	offset: string;
	total: string;
	StandingsTable: DriverStandingsTable;
}

export interface ConstructorMRData {
	xmlns: string;
	series: string;
	url: string;
	limit: string;
	offset: string;
	total: string;
	StandingsTable: ConstructorStandingsTable;
}

// Current Standings models
export interface CurrentDriverStandings {
	MRData: DriverMRData;
}

export interface CurrentConstructorStandings {
	MRData: ConstructorMRData;
}

// Calendar Events model
export interface CalendarEvent {
	name: string;
	slug: string;
	sessions: Record<string, string>;
}

export interface CalendarEvents {
	races: CalendarEvent[];
}
