/* globals WndHandlerDefault, CM, BuyForGoldWindowFactory, GameDataPremium, PremiumWindowFactory, MainWindowFactory,
BuildingWindowFactory, HumanMessage, GameData */
(function () {
	'use strict';

	function WndHandlerUnitBuildings(wndhandle) {
		this.wnd = wndhandle;
		this.onclose_hook = null;
	}

	WndHandlerUnitBuildings.inherits(WndHandlerDefault);

	WndHandlerUnitBuildings.prototype.getDefaultWindowOptions = function () {
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

	WndHandlerUnitBuildings.prototype.initializeBuyForGoldAdvisor = function (advisor_id) {
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

	WndHandlerUnitBuildings.prototype.registerBuildingUnitsComponents = function () {
		var context = this.wnd.getContext(),
			$root = this.wnd.getJQElement(),
			Buildings = require('enums/buildings');

		CM.unregister(context, 'btn_required_building');
		CM.unregister(context, 'btn_required_research');

		CM.register(context, 'btn_required_building', $root.find('.btn_required_building').button({
			icon: true,
			icon_type: 'required_building',
			tooltips: [
				{title: _('Go to Senate')}
			]
		}).on('btn:click', function (e, _btn) {
			MainWindowFactory.openMainWindow();
		}));

		CM.register(context, 'btn_required_research', $root.find('.btn_required_research').button({
			icon: true,
			icon_type: 'required_research',
			tooltips: [
				{title: _('Go to Academy')}
			]
		}).on('btn:click', function (e, _btn) {
			BuildingWindowFactory.open(Buildings.ACADEMY);
		}));
	};

	WndHandlerUnitBuildings.prototype.onBeforeReloadContent = function () {
		this.unregisterEventListeners();
	};

	WndHandlerUnitBuildings.prototype.onReloadContentError = function () {
		this.registerEventListeners();
	};

	WndHandlerUnitBuildings.prototype.onClose = function () {
		if (this.onclose_hook) {
			if (!this.onclose_hook()) {
				HumanMessage.error(_("This window can't be closed."));
				return false;
			}
		}

		this.unregisterEventListeners(true);

		return true;
	};

	WndHandlerUnitBuildings.prototype.onMessage = function (type, building_type) {
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

	window.WndHandlerUnitBuildings = WndHandlerUnitBuildings;
}());
