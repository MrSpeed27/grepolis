/* globals Game, GameData, GameEvents, CM, HumanMessage, MM, BuildingFarm, WndHandlerDefault, BuyForGoldWindowFactory,
PremiumWindowFactory, GameControllers, Backbone, GameDataPremium, TooltipFactory */
(function () {
	'use strict';

	function WndHandlerBuilding(wndhandle) {
		this.wnd = wndhandle;
		this.currentBuilding = '';
		this.onclose_hook = null;
		this.current_tab = null;
		this.switch_town_callback = null;

		/**
		 * Sets window to top if there are no quests running.
		 */
		this.setToTop = function () {
			this.wnd.toTop();
		};

		this.registerEventListeners = function () {
			var that = this,
				name = 'WndHandlerBuilding';

			switch (this.currentBuilding) {
				case 'temple':
					$.Observer(GameEvents.god.choose).subscribe([name], function () {
						that.refresh();
					});

					this.initializeBuyForGoldAdvisor('priest');
					break;
				case 'lumber':
				case 'stoner':
				case 'ironer':
					this.initializeBuyForGoldAdvisor('trader');
					break;
				default:
					break;
			}

			return this;
		};

		this.unregisterEventListeners = function () {
			$.Observer().unsubscribe(['WndHandlerBuilding']);

			//clear interval from building_farm if available
			if (BuildingFarm.timer) {
				window.clearInterval(BuildingFarm.timer);
				BuildingFarm.timer = null;
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

			var action, building;
			this.unregisterEventListeners();

			action = this.current_tab || 'index';
			building = GameData.buildings[this.currentBuilding];

			if (!building) {
				this.wnd.close();
				return;
			}
			this.wnd.clearMenuNow();
			this.wnd.requestContentGet(building.controller, action, data);

			//this.setToTop();
			this.wnd.setTitle(building.name + ' (' + Game.townName + ')');
			this.registerEventListeners();
		};
	}

	WndHandlerBuilding.inherits(WndHandlerDefault);

	WndHandlerBuilding.prototype.initializeBuyForGoldAdvisor = function (advisor_id) {

		//
		//Be aware that this function is also called from farm window handler  !!!
		//

		//Overwritting context usually is not necessary but in this case it conflicts with 'progressbar' from building_temple.js
		//(CM.unregisterSubGroup() below unregisters it, so it stops ticking)
		//When someone will refactor it, please keep that in mind
		var cm_context = $.extend({}, this.wnd.getContext()),
			$root = this.wnd.getJQElement();

		cm_context.sub = 'buy_for_gold_advisor';

		CM.unregisterSubGroup(cm_context);
		CM.register(cm_context, 'btn_buy_' + advisor_id, $root.find('.btn_buy_' + advisor_id).button({
			caption: _('Activate'),
			icon: true,
			icon_type: 'gold',
			tooltips: [
				{title: GameData.texts[advisor_id + '_hint']}
			]
		}).on('btn:click', function (e, _btn) {
			BuyForGoldWindowFactory.openBuyAdvisorWindow(_btn, advisor_id, function () {
				GameDataPremium.getPremiumFeaturesModel().extend(advisor_id, false);
			});
		}));

		CM.register(cm_context, 'btn_show_' + advisor_id + '_advantages', $root.find('.btn_show_' + advisor_id + '_advantages').button({
			template: 'empty'
		}).on('btn:click', function (e, _btn) {
			PremiumWindowFactory.openAdvantagesTab(advisor_id);
		}));
	};

	WndHandlerBuilding.prototype.getDefaultWindowOptions = function () {
		return {
			maxHeight: 900,
			maxWidth: 1200,
			height: 570,
			width: 820,
			resizable: true,
			minimizable: true,
			yOverflowHidden: true
		};
	};

	WndHandlerBuilding.prototype.onInit = function (title, UIopts, building, action, params) {
		if (!building) {
			throw 'No building type specified.';
		}
		action = action || 'index';
		var controller = GameData.buildings[building].controller;

		this.wnd.requestContentGet(controller, action, params || {});

		return true;
	};

	WndHandlerBuilding.prototype.onBeforeReloadContent = function () {
		this.unregisterEventListeners();
	};

	WndHandlerBuilding.prototype.onReloadContentError = function () {
		this.registerEventListeners();
	};

	/**
	 * Window Close Button Action
	 * @return Boolean
	 **/
	WndHandlerBuilding.prototype.onClose = function () {
		if (this.onclose_hook) {
			if (!this.onclose_hook()) {
				HumanMessage.error(_("This window can't be closed."));
				return false;
			}
		}

		this.unregisterEventListeners(true);

		return true;
	};

	WndHandlerBuilding.prototype.onFocus = function () {
	};

	/**
	 * @param data
	 * @param controller String
	 * @param action String
	 * @param params Object
	 */
	WndHandlerBuilding.prototype.onRcvData = function (data, controller, action, params) {
		var newBuilding = controller.replace(/building_/, ''),
			is_frontend_bridge_call = controller === 'frontend_bridge' && action === 'fetch',
			window_type = params.window_type || false,
			tab_type = params.tab_type || false,
			args = params.arguments || {};

		var root = this.wnd.getJQElement();

		if (is_frontend_bridge_call) {
			newBuilding = window_type;
		}

		if (newBuilding !== this.currentBuilding) {
			this.wnd.setTitle(GameData.buildings[newBuilding].name + ' (' + Game.townName + ')');
			this.currentBuilding = newBuilding;
			this.current_tab = null;
			this.switch_town_callback = null;
		}

		this.wnd.setContent2(data.html);
		this.wnd.setHeight(this.getDefaultWindowOptions().height);

		if (this.currentBuilding === require('enums/buildings').WALL) {
			// Add unit card tooltips with full amount
			TooltipFactory.setAllUnitCardTooltips($('#building_wall .wall_report_unit'));
		}

		this.unregisterEventListeners();
		this.registerEventListeners();

		if (this.switch_town_callback) {
			this.switch_town_callback();
		}

		//Handle first two tabs written in Backbone
		//Detect which tab was opened
		if (is_frontend_bridge_call) {
			//Convert models and collections to Grepo objects
			data.old_window = true;
			data.models = MM.createBackboneObjects(data.models, window.GameModels, args);
			data.collections = MM.createBackboneObjects(data.collections, window.GameCollections, args);
			data.templates = data.templates[window_type];

			//First tab - Verteidigung
			if (data.collections.hasOwnProperty('support_for_active_town')) {
				var ctrl = new GameControllers.SupportOverviewController({
					el: root.find('.gpwindow_content'),
					cm_context: this.wnd.getContext()
				});

				ctrl.setMode(tab_type);
				ctrl.renderPage(data);
			}
		}
	};

	/**
	 * @deprecated
	 */
	WndHandlerBuilding.prototype.onMessage = function (type, building_type) {
		type = type || '';
		building_type = building_type || '';

		switch (type) {
			case 'setOnCloseHook':
				this.onclose_hook = building_type;
				break;

			case 'unsetOnCloseHook':
				this.onclose_hook = null;
				break;

		}
		return null;
	};

	WndHandlerBuilding.prototype.submitForm = function (form_id, action) {
		var params = {};
		$('#' + form_id + ' input').each(function () {
			params[this.name] = this.value;
		});
		var building = GameData.buildings[this.currentBuilding];
		this.wnd.requestContentPost(building.controller, action, params);
	};

	us.extend(WndHandlerBuilding.prototype, Backbone.Events);

	window.WndHandlerBuilding = WndHandlerBuilding;
}());
