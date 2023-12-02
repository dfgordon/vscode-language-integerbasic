// These are the settings used in the VSCode client.
// Not all are useful to the server.

export interface integerbasicSettings {
	case: {
		caseSensitive: boolean,
		lowerCaseCompletions: boolean
	},
	warn: {
		undeclaredArrays: boolean,
        undefinedVariables: boolean,
        length: number,
		run: boolean
	},
	hovers: {
		specialAddresses: boolean,
		keywords: boolean
	},
	vii: {
		speed: string,
		color: boolean
	},
	detokenizer: {
		escapes: number[]
	}
	trace: {
		server: string
	}
}

export const defaultSettings: integerbasicSettings = {
	case: {
		caseSensitive: false,
		lowerCaseCompletions: true
	},
	warn: {
		undeclaredArrays: true,
        undefinedVariables: true,
        length: 150,
		run: true
	},
	hovers: {
		specialAddresses: true,
		keywords: true
	},
	vii: {
		speed: "maximum",
		color: false
	},
	detokenizer: {
		escapes: [138,141]
	},
	trace: {
		server: "verbose"
	}
};