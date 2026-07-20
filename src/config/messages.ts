export const messages = {
	backup: {
		created: 'Backup created.',
		createFailed: 'Could not create backup.',
		settingsSaved: 'Backup settings saved.',
		settingsSaveFailed: 'Could not save backup settings.',
	},
	bookmarks: {
		importFailed: 'Could not import bookmarks.',
		noneFound: 'No new web bookmarks were found in that file.',
		imported: 'Bookmarks imported.',
	},
	github: {
		loadRepositoriesFailed: 'Could not load repositories from GitHub.',
		settingsSaved: 'GitHub settings saved.',
		settingsSaveFailed: 'Could not save GitHub settings.',
	},
	settings: {
		generalSaved: 'General settings saved.',
		generalSaveFailed: 'Could not save general settings.',
	},
	shortcuts: {
		added: 'Quick link added.',
		addFailed: 'Could not add quick link.',
		imported: 'Quick links imported.',
		importFailed: 'Could not import quick links.',
		invalidImportJson: 'That file is not valid JSON.',
		limitSaved: 'Quick link limit saved.',
		limitSaveFailed: 'Could not save quick link limit.',
		orderSaved: 'Quick link order saved.',
		orderSaving: 'Saving quick link order...',
		orderSaveFailed: 'Could not save quick link order.',
		removed: 'Quick link removed.',
		removeFailed: 'Could not remove quick link.',
		updated: 'Quick link updated.',
		updateFailed: 'Could not update quick link.',
	},
} as const;
