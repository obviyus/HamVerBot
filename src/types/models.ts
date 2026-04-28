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

export interface DriverStanding {
	position: number;
	driverName: string;
	teamName: string;
	time: string;
	difference?: string;
}

export interface SessionResults {
	title: string;
	standings: DriverStanding[];
}

export interface DriverMRData {
	StandingsTable: {
		season: string;
		StandingsLists: Array<{
			DriverStandings: Array<{
				position: string;
				points: string;
				Driver: {
					code: string;
				};
			}>;
		}>;
	};
}

export interface ConstructorMRData {
	StandingsTable: {
		season: string;
		StandingsLists: Array<{
			ConstructorStandings: Array<{
				position: string;
				points: string;
				Constructor: {
					name: string;
				};
			}>;
		}>;
	};
}
