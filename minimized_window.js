/* globals Backbone */
define('models/minimized_window', function () {
	'use strict';

	return Backbone.Model.extend({
		getType: function () {
			return this.get('type');
		},

		getCid: function () {
			return this.get('cid');
		},

		getTitle: function () {
			return this.get('title');
		},

		getClosable: function () {
			return this.get('closable');
		}
	});
});
