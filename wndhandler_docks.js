/* global Game, GameData, GameEvents, Layout, ITowns, UnitOrder, GPWindowMgr, WndHandlerUnitBuildings, Backbone */

(function() {
	'use strict';

	var Buildings = require('enums/buildings');

	function WndHandlerDocks(wndhandle) {
		this.wnd = wndhandle;
		this.switch_town_callback = null;

		this.registerEventListeners = function() {
			var that = this,
				name = 'WndHandlerDocks';

			this.initializeBuyForGoldAdvisor('commander');
			this.wnd.getJQElement().find('#unit_order').data('wnd_id', this.wnd.getIdentifier());
			var reloadBuildingWithUnitOrders = function () {
				var current_town = ITowns.getCurrentTown(),
					buildings = current_town.buildings();

				if (buildings.getBuildingLevel(Buildings.DOCKS) !== 0) {
					UnitOrder.saveState(false);
					that.reloadBuildingWithUnitOrders();
				}
			};

			$.Observer(GameEvents.town.town_switch).subscribe(
				[name],
				UnitOrder.clearState.bind(UnitOrder, false)
			);
			$.Observer(GameEvents.town.units.change).subscribe(
				[name],
				UnitOrder.handleEvents.bind(UnitOrder, false)
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
			$.Observer(GameEvents.premium.merchant.immediate_call).subscribe([name], reloadBuildingWithUnitOrders);
			$.Observer(GameEvents.premium.merchant.run_out).subscribe([name], reloadBuildingWithUnitOrders);
		};

		/**
		 *
		 */
		this.unregisterEventListeners = function (closing_window) {
			$.Observer().unsubscribe(['WndHandlerDocks']);

			if (closing_window) {
				UnitOrder.clearState(false);
			} else {
				UnitOrder.saveState(false);
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
				building = GameData.buildings[Buildings.DOCKS];
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

	WndHandlerDocks.inherits(WndHandlerUnitBuildings);

	WndHandlerDocks.prototype.onInit = function(title, UIopts, building, action, params){
		if (!building) {
			throw 'No building type specified.';
		}
		action = action || 'index';
		var controller = GameData.buildings[building].controller;

		this.wnd.requestContentGet(controller, action, params || {});

		UnitOrder.clearState(false); // remove localstorage selection

		return true;
	};

	WndHandlerDocks.prototype.onRcvData = function(data) {
		if (Layout.docks_new_units_queue) {
			Layout.docks_new_units_queue._destroy();
			Layout.units_queue = null;
		}

		this.wnd.setTitle(GameData.buildings.docks.name + ' (' + Game.townName + ')' );
		this.wnd.setContent2(data.html);
		this.wnd.setHeight(this.getDefaultWindowOptions().height);

		UnitOrder.loadState(false);

		this.registerBuildingUnitsComponents();

		// re-register eventListeners
		this.unregisterEventListeners();
		this.registerEventListeners();

		if (this.switch_town_callback) {
			this.switch_town_callback();
		}
	};

	WndHandlerDocks.prototype.submitForm = function(form_id, action){
		var params = {};
		$('#' + form_id + ' input').each(function() {
			params[this.name] = this.value;
		});
		var building = GameData.buildings[Buildings.DOCKS];
		this.wnd.requestContentPost(building.controller, action, params);
	};

	WndHandlerDocks.prototype.reloadBuildingWithUnitOrders = function(){
		var wnd = GPWindowMgr.getOpenFirst(GPWindowMgr.TYPE_BUILDING_DOCKS);
		if (wnd) {
			wnd.requestContentGet(GameData.buildings[Buildings.DOCKS].controller, 'index', {});
		}
	};

	us.extend(WndHandlerDocks.prototype, Backbone.Events);

	window.WndHandlerDocks = WndHandlerDocks;

	GPWindowMgr.addWndType('BUILDING_DOCKS', 'taskbar_building', WndHandlerDocks, 1);
}());
