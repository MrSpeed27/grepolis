/* global Game, GameData, GameEvents, Layout, ITowns, UnitOrder, GPWindowMgr, WndHandlerUnitBuildings, Backbone */

(function() {
	'use strict';

	var Buildings = require('enums/buildings');

	function WndHandlerBarracks(wndhandle) {
		this.wnd = wndhandle;
		this.switch_town_callback = null;

		this.registerEventListeners = function() {
			var that = this,
				name = 'WndHandlerBarracks';

			this.initializeBuyForGoldAdvisor('commander');
			this.wnd.getJQElement().find('#unit_order').data('wnd_id', this.wnd.getIdentifier());
			var reloadBuildingWithUnitOrders = function () {
				var current_town = ITowns.getCurrentTown(),
					buildings = current_town.buildings();

				if (buildings.getBuildingLevel(Buildings.BARRACKS) !== 0) {
					UnitOrder.saveState(true);
					that.reloadBuildingWithUnitOrders();
				}
			};


			$.Observer(GameEvents.town.town_switch).subscribe(
				[name],
				UnitOrder.clearState.bind(UnitOrder, true)
			);
			$.Observer(GameEvents.town.units.change).subscribe(
				[name],
				UnitOrder.handleEvents.bind(UnitOrder, true)
			);
			$.Observer(GameEvents.town.units.change).subscribe([name], reloadBuildingWithUnitOrders);
			$.Observer(GameEvents.unit.order.change).subscribe([name], reloadBuildingWithUnitOrders);
			$.Observer(GameEvents.town.power.added).subscribe([name], reloadBuildingWithUnitOrders);
			$.Observer(GameEvents.town.power.removed).subscribe([name], reloadBuildingWithUnitOrders);
			$.Observer(GameEvents.town.units.barracks.order.done).subscribe([name], reloadBuildingWithUnitOrders);
			$.Observer(GameEvents.town.units.docks.order.done).subscribe([name], reloadBuildingWithUnitOrders);
			$.Observer(GameEvents.town.building.order.done).subscribe([name], reloadBuildingWithUnitOrders);
			$.Observer(GameEvents.town.research.done).subscribe([name], reloadBuildingWithUnitOrders);
			$.Observer(GameEvents.command.build_unit).subscribe([name], reloadBuildingWithUnitOrders);
			$.Observer(GameEvents.god.change).subscribe([name], reloadBuildingWithUnitOrders);
		};

		/**
		 *
		 */
		this.unregisterEventListeners = function (closing_window) {
			$.Observer().unsubscribe(['WndHandlerBarracks']);

			if (closing_window) {
				UnitOrder.clearState(true);
			} else {
				UnitOrder.saveState(true);
			}

			this.stopListening();

			return this;
		};

		/**
		 * refreshes the window.
		 */
		this.refresh = function () {
			var data = {
				town_id: Game.townId
			};

			var action = 'index',
				building = GameData.buildings[Buildings.BARRACKS];
			this.unregisterEventListeners();

			if (!building) {
				this.wnd.close();
				return;
			}
			this.wnd.clearMenuNow();
			this.wnd.requestContentGet(building.controller, action, data);

			this.wnd.setTitle(building.name + ' (' + Game.townName + ')');
			this.registerEventListeners();
		};
	}

	WndHandlerBarracks.inherits(WndHandlerUnitBuildings);

	WndHandlerBarracks.prototype.onInit = function(title, UIopts, building, action, params){
		if (!building) {
			throw 'No building type specified.';
		}
		action = action || 'index';
		var controller = GameData.buildings[building].controller;

		this.wnd.requestContentGet(controller, action, params || {});

		UnitOrder.clearState(true); // remove localstorage selection

		return true;
	};

	WndHandlerBarracks.prototype.onRcvData = function(data) {
		if (Layout.barracks_new_units_queue) {
			Layout.barracks_new_units_queue._destroy();
			Layout.units_queue = null;
		}

		this.wnd.setTitle(GameData.buildings.barracks.name + ' (' + Game.townName + ')' );
		this.wnd.setContent2(data.html);
		this.wnd.setHeight(this.getDefaultWindowOptions().height);

		UnitOrder.loadState(true);

		this.registerBuildingUnitsComponents();

		// re-register eventListeners
		this.unregisterEventListeners();
		this.registerEventListeners();

		if (this.switch_town_callback) {
			this.switch_town_callback();
		}
	};

	WndHandlerBarracks.prototype.submitForm = function(form_id, action){
		var params = {};
		$('#' + form_id + ' input').each(function() {
			params[this.name] = this.value;
		});
		var building = GameData.buildings[Buildings.BARRACKS];
		this.wnd.requestContentPost(building.controller, action, params);
	};

	WndHandlerBarracks.prototype.reloadBuildingWithUnitOrders = function(){
		var wnd = GPWindowMgr.getOpenFirst(GPWindowMgr.TYPE_BUILDING_BARRACKS);
		if (wnd) {
			wnd.requestContentGet(GameData.buildings[Buildings.BARRACKS].controller, 'index', {});
		}
	};

	us.extend(WndHandlerBarracks.prototype, Backbone.Events);

	window.WndHandlerBarracks = WndHandlerBarracks;

	GPWindowMgr.addWndType('BUILDING_BARRACKS', 'taskbar_building', WndHandlerBarracks, 1);
}());
