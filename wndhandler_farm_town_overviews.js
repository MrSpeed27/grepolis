/* globals Game, GameEvents, ConfirmationWindowFactory, HumanMessage, _, __, TM, CM, MM, DM, ITowns, Timestamp,
GPWindowMgr, GameDataResearches, Backbone, ngettext, WMap, NotificationLoader, GameData, s */
(function () {
	'use strict';

	const Features = require('data/features'),
		DateHelper = require('helpers/date'),
		TooltipFactory = require('factories/tooltip_factory'),
		UpgradeTooltip = require('farmtowns/helpers/upgrade_tooltip');

	const SORT_BY = {
		NAME: 'name', POINTS: 'points', POPULATION: 'population', STORAGE: 'storage'
	};
	const SORT_DIRECTION = {
		ASC: 'asc', DESC: 'desc'
	};

	function WndHandlerFarmTownOverviews(wnd_handle) {
		this.wnd = wnd_handle;
		this.island_x = 0;
		this.island_y = 0;
		this.current_town_id = 0;
		this.booty_researched = 0;
		this.diplomacy_researched = 0;
		this.trade_office = 0;
		this.loads_data = null;
		this.farm_towns = null;
		this.selected_farm_towns = [];
		this.selected_time_option = null;
		this.max_resources = null;
		this.max_satisfaction_reduce = null;
		this.pillage_menu = false;
		this.towns_data = null;
		this.selected_towns_count = 0;
		this.town_group_id = null;
		this.search_for = null;
		this.sort_by = null;
		this.sorting_direction = null;
		this.l10n = DM.getl10n('overview_toolbar');
		this.available_battle_points = 0;
		this.multiple_towns_upgrade_cost = 0;
		this.upgrade_button_components = [];
		this.unlock_button_components = [];
		this.upgrade_tooltip_template = null;
		this.selected_unit_option = null;
	}

	WndHandlerFarmTownOverviews.inherits(window.WndHandlerDefault);

	us.extend(WndHandlerFarmTownOverviews.prototype, Backbone.Events);

	WndHandlerFarmTownOverviews.prototype.getDefaultWindowOptions = function () {
		return {
			height: 570,
			width: 800,
			resizable: false,
			minimizable: true,
			title: ''
		};
	};

	WndHandlerFarmTownOverviews.prototype.getFarmTownList = function () {
		return this.wnd.getJQElement().find('#farm_town_list');
	};

	WndHandlerFarmTownOverviews.prototype.onInit = function () {
		this.wnd.requestContentGet('farm_town_overviews', 'index', {});
		this.loadUpgradeTooltipTemplate();
		this.stopListening();
		this.getCollection('farm_town_player_relations').onRatioUpdate(this, function (model) {
			this.getFarmTownList().find('.farm_town_el_' + model.getFarmTownId() + ' .popup_ratio')
				.text('1:' + model.getCurrentTradeRatio());
		}.bind(this));

		this.getCollection('farm_town_player_relations').onUpgradeChange(this, this.refetchFarmTowns.bind(this));

		this.getModel('player_killpoints').onPointsChange(this, function (model) {
			this.available_battle_points = model.getUnusedPoints();
			this.registerBattlePointButtons();
		}.bind(this));

		return true;
	};

	WndHandlerFarmTownOverviews.prototype.refetchFarmTowns = function () {
		TM.once('WndHandlerFarmTownOverviews::RefetchFarmTowns::timer', 100, function () {
			if (this.selected_towns_count > 0) {
				this.getFarmTownsFromMultipleTowns();
				return;
			}

			if (this.current_town_id) {
				this.getFarmTownsForCurrentIsland();
			}
		}.bind(this));
	};

	WndHandlerFarmTownOverviews.prototype.getFarmTownsForCurrentIsland = function () {
		const params = {
			island_x: this.island_x,
			island_y: this.island_y,
			booty_researched: this.booty_researched,
			trade_office: this.trade_office,
			diplomacy_researched: this.diplomacy_researched
		};

		if (this.current_town_id) {
			params.current_town_id = this.current_town_id;
		}

		this.getFarmTowns(params);
	};

	WndHandlerFarmTownOverviews.prototype.onRcvData = function (data) {
		// Bind tab click events and invalidate data (without layout related stuff)
		TM.unregister('WndHandlerFarmTownOverviews::AutoRefreshFarmTownOverviewByNextLoot::timer');
		TM.unregister('WndHandlerFarmTownOverviews::initializeResourcesProductionCounter::timer');
		this.initializeResourcesCounter();
		this.bindMenuEvents();
		this.invalideData(false);

		// Set content and bind events on clicks on the town list
		this.wnd.setContent2(data.html);
		this.bindTownClick();
		this.bindSelectAll();

		const local_root = this.wnd.getJQElement();

		this.$town_list = local_root.find('#fto_town_list');
		this.$town_count = local_root.find('#fto_town_count');
		this.$town_list.find('.fto_town.town' + Game.townId).trigger('click');
		this.bindScrollHandler();
		this.bindFiltering();
		this.filterAndSortTowns();
		this.setItemsHidden();
	};

	WndHandlerFarmTownOverviews.prototype.onClose = function () {
		TM.unregister('WndHandlerFarmTownOverviews::AutoRefreshFarmTownOverviewByNextLoot::timer');
		TM.unregister('WndHandlerFarmTownOverviews::initializeResourcesProductionCounter::timer');
		TM.unregister('WndHandlerFarmTownOverviews::UpgradeTimers::timer');
		TM.unregister('WndHandlerFarmTownOverviews::RefetchFarmTowns::timer');

		this.stopListening();

		return true;
	};

	/**
	 * Returns the smallest key from server loads_data hash
	 */
	WndHandlerFarmTownOverviews.prototype._getSmallestAvailableTimeOption = function (loads_data) {
		if (loads_data) {
			return parseInt(us.keys(loads_data)[0], 10);
		}

		return null;
	};
	/**
	 * Get farm towns for the current town_id
	 * @params params - contains coords(int), selected town_id(int) and booty_researched (int)
	 */
	WndHandlerFarmTownOverviews.prototype.getFarmTowns = function (params) {
		// Clean old things up - without layout related stuff because it's set new anyway
		this.invalideData(false);

		this.wnd.ajaxRequestGet('farm_town_overviews', 'get_farm_towns_for_town', params, function (_wnd, data) {
			const farm_town_wrapper = this.wnd.getJQElement().find('#farm_town_wrapper');

			if (Features.battlepointVillagesEnabled()) {
				farm_town_wrapper.addClass('bpv');
			}

			this.loads_data = data.loads_data;
			this.farm_towns = data.farm_town_list;
			this.available_battle_points = data.available_battle_points || 0;

			// If the selected_time_option is not available, reset it
			if (typeof (data.loads_data[this.selected_time_option]) === 'undefined') {
				this.selected_time_option = null;
			}

			// The selected time option is either the saved one or the smallest one from the server
			this.selected_time_option = this.selected_time_option || this._getSmallestAvailableTimeOption(data.loads_data);

			// Select all farms on start - player can deselect them if he wants to
			this.selectAllFarms(false);

			// Set content and bind events
			farm_town_wrapper.html(data.html);
			this.bindFarmTownClick(farm_town_wrapper);
			this.bindOptionsClick();

			// Calculate resources for correct values after fetching
			this.changeMaxResources();

			// Select the correct checkbox in options tab
			this.restoreTimeSelectionCheckbox();

			// Bind popups and text
			$('#max_satisfaction_reduce').parent().tooltip('<h4>' + _('Mood decrease') + '</h4><p>' + _('Low village mood can lead to a loss of control over the farming village.') + '</p><p>' + _('Mood will be restored with time. Should you lose control, you will need to reconquer the village with force.') + '</p>');
			$('#max_claim_resources').parent().tooltip('<h4>' + _('Maximum possible resources') + '</h4><p>' + _('Farming villages whose loads are not ready will not be considered.') + '</p>');

			this.toggleRibbon();
			this.registerBattlePointButtons();
			this.registerUpgradeTimers();
		}.bind(this));
	};

	WndHandlerFarmTownOverviews.prototype.registerBattlePointButtons = function () {
		this.registerUpgradeButtons();
		this.registerUnlockButtons();
		this.registerUpgradeAllButton();
	};

	WndHandlerFarmTownOverviews.prototype.registerUpgradeButtons = function () {
		const context = this.wnd.getContext();

		this.upgrade_button_components.forEach(function (name) {
			CM.unregister(context, name);
		});

		this.upgrade_button_components = [];

		this.getFarmTownList().find('.fto_upgrade_button').each(function (index, el) {
			const $el = $(el),
				farm_town_id = parseInt($el.data('farm-town-id'), 10),
				cost = parseInt($el.data('upgrade-cost'), 10),
				is_max = parseInt($el.data('is-max'), 10) === 1,
				is_upgrading = parseInt($el.data('is-upgrading'), 10) === 1,
				component_name = 'fto_upgrade_button_' + farm_town_id,
				caption = is_max ? _('Max') :
					'<span class="icon_upgrade_btn"></span><span class="fto_upgrade_cost">' + cost + '</span>',
				disabled = is_max || is_upgrading || this.available_battle_points < cost;

			this.upgrade_button_components.push(component_name);
			CM.register(context, component_name, $el.button({
				caption: caption,
				disabled: disabled,
				state: disabled,
				icon: !is_max,
				icon_type: 'battle_points',
				icon_position: 'right',
				tooltips: this.getUpgradeButtonTooltips(farm_town_id, cost, is_max, is_upgrading)
			}).on('btn:click', function (e, btn) {
				$el.data('is-upgrading', 1);
				btn.disable();
				this.upgradeFarmTown(farm_town_id);
			}.bind(this)));
		}.bind(this));
	};

	WndHandlerFarmTownOverviews.prototype.registerUnlockButtons = function () {
		const context = this.wnd.getContext();

		this.unlock_button_components.forEach(function (name) {
			CM.unregister(context, name);
		});

		this.unlock_button_components = [];

		this.getFarmTownList().find('.fto_unlock_button').each(function (index, el) {
			const $el = $(el),
				farm_town_id = parseInt($el.data('farm-town-id'), 10),
				cost = parseInt($el.data('unlock-cost'), 10),
				is_unlocking = parseInt($el.data('is-unlocking'), 10) === 1,
				component_name = 'fto_unlock_button_' + farm_town_id,
				disabled = is_unlocking || this.available_battle_points < cost;

			this.unlock_button_components.push(component_name);
			CM.register(context, component_name, $el.button({
				caption: '<span class="fto_upgrade_cost">' + cost + '</span>',
				disabled: disabled,
				state: disabled,
				icon: true,
				icon_type: 'battle_points',
				icon_position: 'right',
				tooltips: this.getUnlockButtonTooltips(cost, is_unlocking)
			}).on('btn:click', function (e, btn) {
				$el.data('is-unlocking', 1);
				btn.disable();
				this.unlockFarmTown(farm_town_id, cost);
			}.bind(this)));
		}.bind(this));
	};

	WndHandlerFarmTownOverviews.prototype.unlockFarmTown = function (farm_town_id, expected_cost) {
		this.wnd.ajaxRequestPost('farm_town_overviews', 'unlock', {
			farm_town_id: farm_town_id,
			expected_cost: expected_cost
		}, {
			success: function (_wnd, data) {
				if (data && typeof data.available_battle_points !== 'undefined') {
					this.available_battle_points = data.available_battle_points;
				}

				this.refetchFarmTowns();
			}.bind(this),
			error: this.refetchFarmTowns.bind(this)
		});
	};

	WndHandlerFarmTownOverviews.prototype.loadUpgradeTooltipTemplate = function () {
		if (!Features.battlepointVillagesEnabled() || this.hasUpgradeTooltipTemplate()) {
			return;
		}

		this.wnd.ajaxRequestGet('frontend_bridge', 'fetch', {
			window_type: 'farm_town',
			tab_type: 'index',
			known_data: {models: [], collections: [], templates: []},
			'arguments': {}
		}, function (_wnd, data) {
			if (data.templates) {
				DM.loadData({templates: data.templates});
			}

			if (this.farm_towns !== null) {
				this.registerUpgradeButtons();
				this.registerUnlockButtons();
			}
		}.bind(this));
	};

	WndHandlerFarmTownOverviews.prototype.hasUpgradeTooltipTemplate = function () {
		return DM.hasTemplate('farm_town', 'upgrade_button_tooltip');
	};

	WndHandlerFarmTownOverviews.prototype.renderUpgradeTooltip = function (data) {
		if (!this.upgrade_tooltip_template) {
			this.upgrade_tooltip_template = us.template(DM.getTemplate('farm_town', 'upgrade_button_tooltip'));
		}

		return this.upgrade_tooltip_template(data);
	};

	WndHandlerFarmTownOverviews.prototype.getUpgradeButtonTooltips = function (farm_town_id, cost, is_max, is_upgrading) {
		const relation = this.getCollection('farm_town_player_relations').getRelationForFarmTown(farm_town_id);

		if (is_max || is_upgrading || !relation || !this.hasUpgradeTooltipTemplate()) {
			return [
				{title: _('Upgrade the farming village')},
				{title: this.getUpgradeButtonDisabledTooltip(is_max, is_upgrading, cost)}
			];
		}

		const render = disabled => this.renderUpgradeTooltip(UpgradeTooltip.getUpgradeData(
			cost, relation.getUpgradeTime(), relation.getLevel(), this.available_battle_points, disabled
		));

		return [
			{title: render(false)},
			{title: render(true)}
		];
	};

	WndHandlerFarmTownOverviews.prototype.getUnlockButtonTooltips = function (cost, is_unlocking) {
		const title = DM.getl10n('farm_town').unlock_village;

		if (is_unlocking) {
			return [
				{title: title},
				{title: title}
			];
		}

		if (!this.hasUpgradeTooltipTemplate()) {
			return [
				{title: title},
				{title: _('Not enough battle points')}
			];
		}

		const render = disabled => this.renderUpgradeTooltip(UpgradeTooltip.getUnlockData(
			cost, this.available_battle_points, disabled
		));

		return [
			{title: render(false)},
			{title: render(true)}
		];
	};

	WndHandlerFarmTownOverviews.prototype.getUpgradeButtonDisabledTooltip = function (is_max, is_upgrading, cost) {
		if (is_max) {
			return _('Maximum level reached');
		}

		if (is_upgrading) {
			return _('Upgrade still running');
		}

		if (this.available_battle_points < cost) {
			return _('Not enough battle points');
		}

		return '';
	};

	WndHandlerFarmTownOverviews.prototype.registerUpgradeAllButton = function () {
		const context = this.wnd.getContext(),
			$button = this.wnd.getJQElement().find('#fto_upgrade_all_button');

		if (!$button.length) {
			return;
		}

		const total_cost = this.getTotalUpgradeCost(),
			  disabled = total_cost <= 0 || this.available_battle_points < total_cost;

		CM.unregister(context, 'fto_upgrade_all_button');
		CM.register(context, 'fto_upgrade_all_button', $button.button({
			caption: '<span class="icon_upgrade_btn"></span><span class="fto_upgrade_text">'
				+ _('Upgrade all')
				+ '</span><span class="fto_upgrade_all_cost">' + total_cost + '</span>',
			icon: true,
			state: disabled,
			disabled: disabled,
			icon_type: 'battle_points',
			icon_position: 'right',
			tooltips: [
				{title: DM.getl10n('premium').upgrade_all_farm_towns.confirmation.window_title},
				{title: total_cost <= 0 ? _('Currently no village is upgradable') : _('Not enough battle points')}
			]
		}).on('btn:click', function (e, btn) {
			this.upgradeAllFarmTowns(this.getTotalUpgradeCost(), btn);
		}.bind(this)));
	};

	WndHandlerFarmTownOverviews.prototype.getTotalUpgradeCost = function () {
		if (this.selected_towns_count > 0) {
			return this.multiple_towns_upgrade_cost;
		}

		let total = 0;

		this.getFarmTownList().find('.fto_upgrade_button').each(function (index, el) {
			const $el = $(el),
				cost = parseInt($el.data('upgrade-cost'), 10),
				is_max = parseInt($el.data('is-max'), 10) === 1,
				is_upgrading = parseInt($el.data('is-upgrading'), 10) === 1;

			if (!is_max && !is_upgrading) {
				total += cost;
			}
		});

		return total;
	};

	WndHandlerFarmTownOverviews.prototype.registerUpgradeTimers = function () {
		TM.unregister('WndHandlerFarmTownOverviews::UpgradeTimers::timer');

		const $timers = this.getFarmTownList().find('.fto_upgrade_timer, .next_demand_time[data-loot-at]');

		if (!$timers.length) {
			return;
		}

		TM.register('WndHandlerFarmTownOverviews::UpgradeTimers::timer', 1000, this.updateUpgradeTimers.bind(this));
		this.updateUpgradeTimers();
	};

	WndHandlerFarmTownOverviews.prototype.updateUpgradeTimers = function () {
		const now = Timestamp.now(),
			$list = this.getFarmTownList();
		let running = false;

		$list.find('.fto_upgrade_timer').each(function (index, el) {
			const $el = $(el),
				time_left = parseInt($el.data('expansion-at'), 10) - now;

			if (time_left > 0) {
				running = true;
			} else if (!$el.data('expired')) {
				$el.data('expired', 1);
				NotificationLoader.resetNotificationRequestTimeout(100);
			}

			$el.text(DateHelper.readableSeconds(Math.max(time_left, 0)));
		});

		$list.find('.next_demand_time[data-loot-at]').each(function (index, el) {
			const $el = $(el),
				time_left = parseInt($el.data('loot-at'), 10) - now;

			if (time_left > 0) {
				running = true;
				$el.text(DateHelper.readableSeconds(time_left));
			}
		});

		if (!running) {
			TM.unregister('WndHandlerFarmTownOverviews::UpgradeTimers::timer');
		}
	};

	WndHandlerFarmTownOverviews.prototype.upgradeFarmTown = function (farm_town_id) {
		this.wnd.ajaxRequestPost('farm_town_overviews', 'upgrade', {
			farm_town_id: farm_town_id
		}, {
			success: function (_wnd, data) {
				if (data && typeof data.available_battle_points !== 'undefined') {
					this.available_battle_points = data.available_battle_points;
				}
			}.bind(this),
			error: this.refetchFarmTowns.bind(this)
		});
	};

	WndHandlerFarmTownOverviews.prototype.upgradeAllFarmTowns = function (total_cost, button) {
		const towns = this.selected_towns_count > 0 ? this.getSelectedTowns() : [this.current_town_id];

		if (!towns.length || (this.selected_towns_count <= 0 && this.current_town_id <= 0)) {
			return;
		}

		ConfirmationWindowFactory.openConfirmationUpgradeAllFarmTowns(total_cost, function () {
			button.disable();

			this.wnd.ajaxRequestPost('farm_town_overviews', 'upgrade_all', {
				towns: towns,
				expected_cost: total_cost
			}, {
				success: function (_wnd, data) {
					if (data && typeof data.available_battle_points !== 'undefined') {
						this.available_battle_points = data.available_battle_points;
					}
				}.bind(this),
				error: this.refetchFarmTowns.bind(this)
			});
		}.bind(this), null);
	};

	/**
	 * Changes the maximum resources display in layout
	 * If player is in pillage menu also satisfaction is calculated
	 */
	WndHandlerFarmTownOverviews.prototype.changeMaxResources = function () {
		this.max_resources = 0;
		this.max_satisfaction_reduce = 0;

		const modification = this.pillage_menu ? 2 : 1,
			diplomacy_bonus_factor = this.diplomacy_researched ? 1 + GameDataResearches.getBonusDiplomacyResources() : 1;

		// Iterate over selected farms
		for (let i = 0; i < this.selected_farm_towns.length; i++) {
			for (let k = 0; k < this.farm_towns.length; k++) {
				if (this.farm_towns[k].id === this.selected_farm_towns[i]) {
					this.max_resources += parseInt(this.loads_data[this.selected_time_option].resources[this.farm_towns[k].stage - 1] * modification * diplomacy_bonus_factor, 10);
					if (this.pillage_menu) {
						this.max_satisfaction_reduce = this.loads_data[this.selected_time_option].mood;
					}
				}
			}
		}

		// If there is no selected farms and all demanded, we show the full outcome
		if (this.selected_farm_towns.length === 0) {
			for (let j = 0; j < this.farm_towns.length; j++) {
				if (this.farm_towns[j].rel === 1 && this.farm_towns[j].loot && Timestamp.now() < this.farm_towns[j].loot) {
					this.max_resources += parseInt(this.loads_data[this.selected_time_option].resources[this.farm_towns[j].stage - 1] * modification * diplomacy_bonus_factor, 10);
					if (this.pillage_menu) {
						this.max_satisfaction_reduce = this.loads_data[this.selected_time_option].mood;
					}
				}
			}
		}

		const resources = ['wood', 'stone', 'iron'],
			town = ITowns.getTown(this.current_town_id),
			storage = town.getStorage(),
			res = town.resources();

		for (let l = 0; l < resources.length; l++) {
			const id = resources[l],
				elm = $('#fto_' + id + '_exceeded span.count');

			if (elm.length) {
				if ((res[id] + this.max_resources) >= storage) {
					elm.html(storage)[0].className = 'count small town_storage_full';
				} else {
					elm.html(res[id] + this.max_resources)[0].className = 'count small';
				}
			}
		}

		$('#max_claim_resources').html('+' + this.max_resources);
		$('#max_satisfaction_reduce').html(this.max_satisfaction_reduce > 0 ? ('-' + this.max_satisfaction_reduce) : this.max_satisfaction_reduce);
		this.changeUnitAmounts();
	};

	WndHandlerFarmTownOverviews.prototype.isUnitOptionUnlocked = function (option, farm_level) {
		const requirements = GameData.farm_town.building_requirements.units;

		return Boolean(requirements[option]) && farm_level >= requirements[option].level;
	};

	WndHandlerFarmTownOverviews.prototype.changeUnitAmounts = function () {
		const $unit_boxes = $('#fto_unit_options').find('div.fto_unit_checkbox');

		if (!$unit_boxes.length) {
			return;
		}

		const towns_units = this.selected_towns_count > 0 ?
			this.getUnitsDataForSelectedTowns() :
			[{town_id: this.current_town_id, units_data: this.getUnitsDataForSelectedFarmTowns()}];

		$unit_boxes.each(function (index, el) {
			const $el = $(el),
				option = $el.data('unit_option'),
				unit_type = $el.data('unit_type');
			let total = 0;

			towns_units.forEach(function (entry) {
				const town = ITowns.getTown(entry.town_id),
					farm_level = town ? town.getBuildings().getBuildingLevel('farm') : 0;

				if (this.isUnitOptionUnlocked(option, farm_level)) {
					total += entry.units_data[unit_type] || 0;
				}
			}.bind(this));

			$el.find('.fto_unit_amount').text(total);
		}.bind(this));
	};

	WndHandlerFarmTownOverviews.prototype.getUnitsDataForSelectedTowns = function () {
		const towns_data = this.towns_data || {},
			result = [];

		this.$town_list.find('.town_checkbox.checked').each(function (index, el) {
			const town_id = $(el).data('town_id');

			if (towns_data[town_id] && towns_data[town_id].units_data) {
				result.push({town_id: town_id, units_data: towns_data[town_id].units_data});
			}
		});

		return result;
	};

	WndHandlerFarmTownOverviews.prototype.getUnitsDataForSelectedFarmTowns = function () {
		const claim_units = GameData.farm_town.claim_units,
			units_data = {};

		if (!this.farm_towns) {
			return units_data;
		}

		this.selected_farm_towns.forEach(function (farm_town_id) {
			const farm_town = us.find(this.farm_towns, ft => ft.id === farm_town_id);

			us.each((farm_town && claim_units[farm_town.stage]) || {}, function (amount, unit_type) {
				units_data[unit_type] = (units_data[unit_type] || 0) + parseInt(amount, 10);
			});
		}.bind(this));

		return units_data;
	};

	WndHandlerFarmTownOverviews.prototype.getUnitTypeForOption = function (option) {
		if (option === null) {
			return null;
		}

		const $box = $('#fto_unit_options').find('div.fto_unit_checkbox[data-unit_option="' + option + '"]');

		return $box.length ? $box.data('unit_type') : null;
	};

	WndHandlerFarmTownOverviews.prototype.claimLoadsMultiple = function () {
		this.wnd.ajaxRequestPost('farm_town_overviews', 'claim_loads_multiple', {
			towns: this.getSelectedTowns(),
			time_option_base: this.selected_time_option,
			time_option_booty: this.selected_time_option_loyalty,
			claim_factor: (this.pillage_menu ? 'double' : 'normal')
		}, function (_wnd, data) {
			WMap.pollForMapChunksUpdate();
			this.onRcvData(data);
		}.bind(this));
	};

	/**
	 * Farms which are not ready yet, but marked - will be ignored
	 */
	WndHandlerFarmTownOverviews.prototype.claimLoads = function () {
		let i = this.selected_farm_towns.length;
		const farm_town_ids = [];

		// Error handling
		if (this.selected_farm_towns.length <= 0) {
			HumanMessage.error(_("You haven't selected any farming villages."));

			return;
		}

		if (this.selected_time_option === null) {
			HumanMessage.error(_("You haven't selected any time options."));

			return;
		}

		// Put each selected farm_town_id in an array
		while (i--) {
			farm_town_ids.push(parseInt(this.selected_farm_towns[i], 10));
		}

		ConfirmationWindowFactory.openConfirmationWastedResources(
			this._doClaimLoads.bind(this, farm_town_ids), null, {
				'wood': this.max_resources,
				'stone': this.max_resources,
				'iron': this.max_resources
			},
			this.current_town_id
		);
	};

	WndHandlerFarmTownOverviews.prototype._doClaimLoads = function (farm_town_ids) {
		this.wnd.ajaxRequestPost('farm_town_overviews', 'claim_loads', {
			farm_town_ids: farm_town_ids,
			time_option: this.selected_time_option,
			claim_factor: (this.pillage_menu ? 'double' : 'normal'),
			current_town_id: this.current_town_id
		}, function (_wnd, data) {
			// Update the resources for the selected town
			for (const j in data.resources) {
				if (data.resources.hasOwnProperty(j)) {
					const elm = this.$town_list.find('li.town' + this.current_town_id + ' span.fto_resource_count.' + j + ' span.count');

					elm.html(data.resources[j]);

					if (elm.length) {
						elm[0].className = (data.storage > data.resources[j]) ? 'small count' : 'small count town_storage_full';
					}
				}
			}

			if (this.current_town_id === Game.townId) {
				$.Observer(GameEvents.window.farm.claim_load).publish({
					targets: farm_town_ids,
					claim_type: (this.pillage_menu ? 'double' : 'normal'),
					time: this.selected_time_option,
					claimed_resources_per_resource_type: data.claimed_resources_per_resource_type
				});
			}

			// Change mouse popup on islands if farm town was handled
			for (const updated_farm_town_id in data.handled_farms) {
				if (!data.handled_farms.hasOwnProperty(updated_farm_town_id)) {
					continue;
				}

				const farm_town = data.handled_farms[updated_farm_town_id],
					lootable_human = DateHelper.readableSeconds(farm_town.lootable_at - Timestamp.now('s'));

				WMap.removeFarmTownLootCooldownIconAndRefreshLootTimers(updated_farm_town_id);
				WMap.updateStatusInChunkTowns(
					updated_farm_town_id,
					farm_town.satisfaction,
					Timestamp.now() + this.selected_time_option,
					Timestamp.now(),
					lootable_human,
					farm_town.relation_status
				);
				WMap.pollForMapChunksUpdate();
			}

			// Finally fetch farm towns to have clean data with new timestamps for the loads etc.
			this.refetchFarmTowns();
		}.bind(this));
	};

	WndHandlerFarmTownOverviews.prototype.claimUnits = function () {
		if (this.selected_farm_towns.length <= 0) {
			HumanMessage.error(_("You haven't selected any farming villages."));
			return;
		}

		const farm_town_ids = this.selected_farm_towns.slice(),
			needed_population = this.getNeededPopulationForTown(this.current_town_id),
			free_population = this.getFreePopulationForTown(this.current_town_id),
			confirm = this._doClaimUnits.bind(this, farm_town_ids, this.current_town_id);

		if (needed_population > free_population) {
			ConfirmationWindowFactory.openSimpleConfirmation(
				_('Not enough free population'),
				_('You do not have enough free population in this city to recruit all units. Villages whose units would exceed your free population will not be collected. Do you want to continue?'),
				confirm
			);
		} else {
			confirm();
		}
	};

	WndHandlerFarmTownOverviews.prototype._doClaimUnits = function (farm_town_ids, town_id) {
		this.wnd.ajaxRequestPost('farm_town_overviews', 'claim_loads', {
			farm_town_ids: farm_town_ids,
			claim_type: 'units',
			unit_option: this.selected_unit_option,
			current_town_id: town_id
		}, function (_wnd, data) {
			this.showUnitClaimFeedback(data);
			this.updateResources();

			if (town_id === Game.townId) {
				$.Observer(GameEvents.window.farm.claim_unit).publish({
					targets: farm_town_ids,
					unit_type: this.getUnitTypeForOption(this.selected_unit_option),
					data: data.unit_claim_result
				});
			}

			WMap.pollForMapChunksUpdate();
			this.refetchFarmTowns();
		}.bind(this));
	};

	WndHandlerFarmTownOverviews.prototype.handleClaimUnitsMultiple = function () {
		if (this.selected_towns_count <= 0 || this.selected_unit_option === null) {
			return;
		}

		ConfirmationWindowFactory.openConfirmationRecruitUnitsFarmTowns(this.claimUnitsMultiple.bind(this), null);
	};

	WndHandlerFarmTownOverviews.prototype.claimUnitsMultiple = function () {
		this.wnd.ajaxRequestPost('farm_town_overviews', 'claim_loads_multiple', {
			towns: this.getSelectedTowns(),
			claim_type: 'units',
			unit_option: this.selected_unit_option
		}, function (_wnd, data) {
			this.showUnitClaimFeedback(data);
			WMap.pollForMapChunksUpdate();
			this.onRcvData(data);
		}.bind(this));
	};

	WndHandlerFarmTownOverviews.prototype.getNeededPopulationForTown = function (town_id) {
		if (!this.farm_towns) {
			return 0;
		}

		const claim_units = GameData.farm_town.claim_units,
			town = ITowns.getTown(town_id),
			farm_level = town ? town.getBuildings().getBuildingLevel('farm') : 0,
			unlocked = this.isUnitOptionUnlocked(this.selected_unit_option, farm_level),
			unit_type = unlocked ? this.getUnitTypeForOption(this.selected_unit_option) : null;

		if (unit_type === null) {
			return 0;
		}

		const unit_population = GameData.units[unit_type] ? GameData.units[unit_type].population : 1;
		let needed = 0;

		this.selected_farm_towns.forEach(function (farm_town_id) {
			const farm_town = us.find(this.farm_towns, function (ft) {
				return ft.id === farm_town_id;
			});

			if (farm_town && claim_units[farm_town.stage] && claim_units[farm_town.stage][unit_type]) {
				needed += parseInt(claim_units[farm_town.stage][unit_type], 10) * unit_population;
			}
		}.bind(this));

		return needed;
	};

	WndHandlerFarmTownOverviews.prototype.getFreePopulationForTown = function (town_id) {
		const town = ITowns.getTown(town_id);

		return town ? town.getAvailablePopulation() : 0;
	};

	WndHandlerFarmTownOverviews.prototype.showUnitClaimFeedback = function (data) {
		const result = data.unit_claim_result;

		if (!result) {
			return;
		}

		const recruited_parts = [];
		for (const unit_type in result.recruited) {
			if (result.recruited.hasOwnProperty(unit_type) && result.recruited[unit_type] > 0) {
				const amount = result.recruited[unit_type],
					unit_data = GameData.units[unit_type];
				let unit_name = unit_type;

				if (unit_data) {
					unit_name = amount > 1 ? unit_data.name_plural : unit_data.name;
				}

				recruited_parts.push(amount + ' ' + unit_name);
			}
		}

		if (recruited_parts.length === 0) {
			HumanMessage.error(result.error || _('No units could be recruited.'));
			return;
		}

		let message = s(
			ngettext(
				'You have recruited %1 in %2 city.',
				'You have recruited %1 in %2 cities.',
				result.handled_towns
			),
			recruited_parts.join(', '),
			result.handled_towns
		);

		if (result.skipped_towns > 0) {
			message += ' ' + s(
				ngettext(
					'%1 city did not recruit any units.',
					'%1 cities did not recruit any units.',
					result.skipped_towns
				),
				result.skipped_towns
			);
		}

		if (result.skipped_farm_towns > 0) {
			message += ' ' + s(
				ngettext(
					'%1 farming village was skipped.',
					'%1 farming villages were skipped.',
					result.skipped_farm_towns
				),
				result.skipped_farm_towns
			);
		}

		HumanMessage.success(message);
	};

	/**
	 * Invalidate data, basically used for clean calculations
	 *
	 * @params change_button - selects all farm towns in layout (not in the "backend")
	 */
	WndHandlerFarmTownOverviews.prototype.invalideData = function (change_button) {
		this.selected_farm_towns = [];
		this.selected_towns_count = 0;
		this.towns_data = null;
		this.max_resources = null;
		this.max_satisfaction_reduce = null;
		const pillage = this.pillage_menu;

		if (change_button) {
			$('#fto_claim_button').find('span.middle').html((pillage ? _('Loot') : __('verb|Demand')));
		}
	};

	/**
	 * Filters all farm towns which have a loot timestamp greater than timestamp now and sorts them so the
	 * ones with the smallest value come first
	 *
	 * @returns array
	 */
	WndHandlerFarmTownOverviews.prototype.getSortedFarmTownsByLootTimestamp = function () {
		const filtered_farm_towns = this.farm_towns.filter(function (farm_town) {
			return farm_town.loot > Timestamp.now();
		});

		return us.sortBy(filtered_farm_towns, function (farm_town) {
			return farm_town.loot;
		});
	};

	/**
	 * Returns an array with farm towns which have a different timestamp, because farm towns which are ready
	 * now to be looted have all the same timestamp, and it can also be the case that the player loots one or more
	 * farm towns at the same time, then they will also have the same timestamp (we don't need all the same timestamps,
	 * just one of it)
	 *
	 * @returns array
	 */
	WndHandlerFarmTownOverviews.prototype.getLootingFarmTowns = function () {
		return us.uniq(this.getSortedFarmTownsByLootTimestamp(), true, function (farm_town) {
			return farm_town.loot;
		});
	};

	/**
	 * Check which farm towns have the special timestamp and update them (refresh them)
	 */
	WndHandlerFarmTownOverviews.prototype.refreshFarmTowns = function (loot) {
		const farm_towns_to_refresh = this.farm_towns.filter(function (farm_town) {
			return farm_town.loot === loot;
		});

		const $list = this.getFarmTownList();

		farm_towns_to_refresh.forEach(function (farm_town) {
			const farm_check = $list.find('a.checkbox.farm_town_' + farm_town.id),
				$entry = farm_check.closest('.fto_list_entry');

			$entry.removeClass('disabled');
			$entry.addClass('active');
			farm_check.addClass('checked');
			this.selected_farm_towns.push(farm_town.id);
			$entry.find('.next_demand_time').text(_('ready'));

			$entry.find('.fto_tile_content').each(function (i, el) {
				const popup = $(el).data('popup_obj');

				if (popup) {
					popup.destroy();
				}
			});
		}.bind(this));
	};

	/**
	 * Unregister the running timer and remove it from the loot array
	 */
	WndHandlerFarmTownOverviews.prototype.unRegisterTimer = function () {
		TM.unregister('WndHandlerFarmTownOverviews::AutoRefreshFarmTownOverviewByNextLoot::timer');
	};

	/**
	 * Take the first timer from the loot array and register a new timeout
	 */
	WndHandlerFarmTownOverviews.prototype.registerNextLootTimer = function () {
		const looting_farm_towns = this.getLootingFarmTowns();

		if (looting_farm_towns.length === 0) {
			return;
		}

		const farm_town_loot = looting_farm_towns[0].loot,
			timeout_time = (farm_town_loot - Timestamp.now()) * 1000;

		TM.once('WndHandlerFarmTownOverviews::AutoRefreshFarmTownOverviewByNextLoot::timer', timeout_time, function () {
			this.refreshFarmTowns(farm_town_loot);

			if (!this.selected_towns_count) {
				this.changeMaxResources();
			}

			this.registerButtonComponent();
			this.unRegisterTimer();
			this.registerNextLootTimer();
			this.toggleRibbon();
		}.bind(this));
	};

	/**
	 * Select all farms on the island which are owned by the player
	 *
	 * @params add_highlighting - selects all farm towns in layout (not in the "backend")
	 */
	WndHandlerFarmTownOverviews.prototype.selectAllFarms = function (add_highlighting) {
		this.registerNextLootTimer();

		const wrapper = this.getFarmTownList();

		if (add_highlighting) {
			wrapper.find('a.checkbox').closest('.fto_list_entry').removeClass('active');
			wrapper.find('a.checkbox').removeClass('checked');
		}

		let k = this.farm_towns.length;

		while (k--) {
			// Only add to selected_farm_towns if player owns the farm town, loot is possible and
			// the town is not upgrading (in BPV)
			const farm_town = this.farm_towns[k], now = Timestamp.now();

			if (farm_town.rel === 1 && farm_town.loot <= now) {
				if (this.selected_farm_towns.indexOf(this.farm_towns[k].id) <= -1) {
					this.selected_farm_towns.push(this.farm_towns[k].id);
				}

				if (add_highlighting) {
					const farm_check = wrapper.find('a.checkbox.farm_town_' + this.farm_towns[k].id);

					farm_check.closest('.fto_list_entry').addClass('active');
					farm_check.addClass('checked');
				}
			}
		}
	};

	/**
	 * Binds click event on farm town elements
	 */
	WndHandlerFarmTownOverviews.prototype.bindFarmTownClick = function (farm_town_wrapper) {
		farm_town_wrapper.find('li.owned').off().on("click", function (e) {
			if (e.target.className && e.target.className.match('gp_town_link')) {
				return;
			}

			// A click on the upgrade button must not toggle the collection selection
			if ($(e.target).closest('.fto_upgrade_button').length) {
				return;
			}

			const elm = $(e.currentTarget),
				checkbox = elm.find('a.checkbox'),
				farm_town_id = parseInt(checkbox[0].className.match(/\d+/), 10);

			if (elm.hasClass('disabled')) {
				return;
			}

			// toggleClass cannot be used because of the array functions
			if (checkbox.hasClass('checked')) {
				elm.removeClass('active');
				checkbox.removeClass('checked');

				const i = this.selected_farm_towns.indexOf(farm_town_id);

				this.selected_farm_towns.splice(i, 1);
			} else {
				elm.addClass('active');
				checkbox.addClass('checked');
				this.selected_farm_towns.push(farm_town_id);
			}

			// Change the maximum amount of resources after selection has changed
			this.changeMaxResources();
		}.bind(this));
	};

	/**
	 * Binds click event on time option elements
	 */
	WndHandlerFarmTownOverviews.prototype.bindOptionsClick = function () {
		$('#farm_town_options').show().find('div.fto_time_checkbox').off().on("click", function (e) {
			const elm = $(e.currentTarget || e.target);

			if (elm.parent().hasClass('time_options_loyalty')) {
				this.selected_time_option_loyalty = elm.data('option');
			} else {
				this.selected_time_option = elm.data('option');
			}

			// Remove all checkboxes
			const container = elm.parent();

			container.find('a').removeClass('checked');
			container.find('div.fto_time_checkbox').removeClass('active');

			// Set new option
			elm.addClass('active');
			elm.find('a').addClass('checked');

			this.selectResourceMode();

			if (this.selected_towns_count) {
				this.calculateResourcesForMultipleTowns();
			} else {
				this.changeMaxResources();
			}
		}.bind(this));

		this.bindUnitOptionsClick();
		this.registerButtonComponent();
	};

	WndHandlerFarmTownOverviews.prototype.bindUnitOptionsClick = function () {
		const $unit_boxes = $('#fto_unit_options').find('div.fto_unit_checkbox');

		if (!$unit_boxes.length) {
			return;
		}

		$unit_boxes.off('click').on('click', function (e) {
			const elm = $(e.currentTarget || e.target);

			if (elm.hasClass('locked')) {
				return;
			}

			this.selected_unit_option = elm.data('unit_option');
			this.activateUnitBox(elm);
			this.registerButtonComponent();
		}.bind(this));

		this.updateUnitOptionLocks();
		this.bindUnitCardTooltips();
		this.restoreUnitSelectionCheckbox();
	};

	WndHandlerFarmTownOverviews.prototype.activateUnitBox = function ($box) {
		$('#fto_unit_options').find('div.fto_unit_checkbox').removeClass('active').find('a').removeClass('checked');
		$('#time_options_wrapper').find('div.fto_time_checkbox').removeClass('active').find('a').removeClass('checked');

		$box.addClass('active');
		$box.find('a').addClass('checked');
		this.toggleUnitMode(true);
	};

	WndHandlerFarmTownOverviews.prototype.restoreUnitSelectionCheckbox = function () {
		if (this.selected_unit_option === null) {
			return;
		}

		const $box = $('#fto_unit_options').find('div.fto_unit_checkbox[data-unit_option="' + this.selected_unit_option + '"]');

		if (!$box.length || $box.hasClass('locked')) {
			this.selected_unit_option = null;
			return;
		}

		this.activateUnitBox($box);
	};

	WndHandlerFarmTownOverviews.prototype.bindUnitCardTooltips = function () {
		$('#fto_unit_options').find('div.fto_unit_checkbox').each(function (index, el) {
			const $el = $(el);

			$el.find('.unit_icon25x25').tooltip(TooltipFactory.getUnitCard($el.data('unit_type')), {}, false);
		});
	};

	WndHandlerFarmTownOverviews.prototype.updateUnitOptionLocks = function () {
		const town = ITowns.getTown(this.current_town_id),
			farm_level = town ? town.getBuildings().getBuildingLevel('farm') : 0,
			requirements = GameData.farm_town.building_requirements.units,
			multi_view = this.selected_towns_count > 0;

		$('#fto_unit_options').find('div.fto_unit_checkbox').each(function (index, el) {
			const $el = $(el),
				option = parseInt($el.data('unit_option'), 10),
				locked = !multi_view && !this.isUnitOptionUnlocked(option, farm_level);

			$el.toggleClass('locked', locked);

			if (locked) {
				$el.tooltip(s(_('Requires farm level %1'), requirements[option].level));
			}
		}.bind(this));
	};

	WndHandlerFarmTownOverviews.prototype.selectResourceMode = function () {
		if (this.selected_unit_option === null) {
			return;
		}

		this.selected_unit_option = null;
		$('#fto_unit_options').find('div.fto_unit_checkbox').removeClass('active').find('a').removeClass('checked');
		this.toggleUnitMode(false);
		this.restoreTimeSelectionCheckbox();
		this.registerButtonComponent();
	};

	WndHandlerFarmTownOverviews.prototype.toggleUnitMode = function (unit_mode) {
		$('#total_resources_claimed').css('visibility', unit_mode === true ? 'hidden' : '');
		$('.fto_farm_claim_res').css('visibility', unit_mode === true ? 'hidden' : '');
	};

	/**
	 * Register Demand/Loot button
	 */
	WndHandlerFarmTownOverviews.prototype.registerButtonComponent = function () {
		const context = this.wnd.getContext(), has_active_farm = this.isAtLeastOneFarmActive();

		CM.unregister(context, 'claim_button');
		CM.register(context, 'claim_button', $('#fto_claim_button').button({
			caption: this.getButtonCaption(),
			disabled: !has_active_farm,
			state: !has_active_farm,
			tooltips: [{title: this.getClaimButtonTooltip()}, {title: this.getDisabledButtonTextTooltip()}]
		}).on('btn:click', function () {
			if (this.selected_unit_option !== null) {
				if (this.selected_towns_count <= 0) {
					this.claimUnits();
				} else {
					this.handleClaimUnitsMultiple();
				}
			} else if (this.selected_towns_count <= 0) {
				this.claimLoads();
			} else {
				this.handleClaimLoadsMultiple();
			}
		}.bind(this)));
	};

	/**
	 * Check if there is at least one farm town which can be claimed or looted
	 *
	 * @returns {boolean}
	 */
	WndHandlerFarmTownOverviews.prototype.isAtLeastOneFarmActive = function () {
		return this.selected_towns_count > 0 || $('.fto_list_entry.owned').hasClass('active');
	};

	WndHandlerFarmTownOverviews.prototype.getClaimButtonTooltip = function () {
		if (this.selected_unit_option !== null) {
			return _('Recruits units from all ready villages. The value shown is the maximum, with all villages ready.');
		} else if (this.pillage_menu) {
			return _('Loot resources from your farming villages');
		} else if (Features.battlepointVillagesEnabled()) {
			return _('Collects from all ready villages. The value shown is the maximum, with all villages ready.');
		}

		return _('Demand resources from your farming villages');
	};

	/**
	 * Get Tooltip text for disabled demand / loot button
	 *
	 * @returns {*}
	 */
	WndHandlerFarmTownOverviews.prototype.getDisabledButtonTextTooltip = function () {
		if (this.selected_unit_option !== null) {
			return _('Recruiting units is currently not possible. Wait until a village you control is ready to provide units again.');
		} else if (this.pillage_menu) {
			return _('The time for looting is not ripe again, you have to wait before you can loot a village under your control again.');
		} else if (Features.battlepointVillagesEnabled()) {
			return _('Collecting resources is currently not possible. Wait until a village you control is ready to provide resources again.');
		}

		return _('Demanding resources is currently not possible. Wait until a village you control is ready to provide resources again.');
	};

	/**
	 * Bind events on tab menu
	 */
	WndHandlerFarmTownOverviews.prototype.bindMenuEvents = function () {
		// Bind tab click events
		$('#fto_claim').on("click", function () {
			this.pillage_menu = false;
			this.selectResourceMode();
			this.invalideData(true);
			this.selectAllFarms(true);
			this.changeMaxResources();
			this.registerButtonComponent();
		}.bind(this));

		// This tab / element is not there with new battle point villages
		const elem = $('#fto_pillage');

		if (elem.length) {
			elem.on("click", this.pillageClick.bind(this));
		}
	};

	/**
	 * Bind events on town list
	 */
	WndHandlerFarmTownOverviews.prototype.bindTownClick = function () {
		// Fetch farm towns on click event and highlight the selected town
		$('#fto_town_list').off().on("click", function (e) {
			let target = $(e.target);
			const params = {};

			if (target.hasClass('town_checkbox')) {
				this.handleTownCheckboxClick(target);
			}

			if (this.selected_towns_count > 0) {
				return;
			}

			if (!target.hasClass('fto_town')) {
				target = $(target).parents('li');
			}

			// For some reason I cannot prevent bubbling ...
			if (!target.length || e.target.tagName === 'A') {
				return;
			}

			target.addClass('active').siblings('li').removeClass('active');

			this.island_x = params.island_x = target.data('island_x');
			this.island_y = params.island_y = target.data('island_y');
			this.current_town_id = params.current_town_id = target.data('town_id');
			this.booty_researched = params.booty_researched = target.data('booty_researched');
			this.diplomacy_researched = params.diplomacy_researched = target.data('diplomacy_researched');
			this.trade_office = params.trade_office = target.data('trade_office');

			// Get the farm towns for the selected city
			this.getFarmTowns(params);
		}.bind(this));
	};

	/**
	 * Setup pillage menu
	 */
	WndHandlerFarmTownOverviews.prototype.pillageClick = function () {
		this.pillage_menu = true;
		this.selectResourceMode();
		this.invalideData(true);

		if (this.farm_towns !== null) {
			this.selectAllFarms(true);
			this.changeMaxResources();
			this.registerButtonComponent();
		}
	};

	/**
	 * Resets the resources counter offset of all towns
	 */
	WndHandlerFarmTownOverviews.prototype.initializeResourcesCounter = function () {
		const step = 5000; // Update every 5 seconds

		TM.unregister('WndHandlerFarmTownOverviews::initializeResourcesProductionCounter::timer');
		TM.register(
			'WndHandlerFarmTownOverviews::initializeResourcesProductionCounter::timer',
			step,
			this.updateResources.bind(this)
		);
	};

	/**
	 * Updates the resources for all available towns. and updates html elements in the overviews
	 * e.g. in the trade overview
	 */
	WndHandlerFarmTownOverviews.prototype.updateResources = function () {
		const resources = ['wood', 'stone', 'iron'],
			towns = ITowns.getTowns();
		let town, res, i, $town, $elem;
		let town_id;

		for (town_id in towns) {
			if (!towns.hasOwnProperty(town_id)) {
				continue;
			}

			town = towns[town_id];
			$town = this.$town_list.find('li.town' + town_id + ':not(.hidden)');

			if (!$town.length) {
				continue;
			}

			$town.find('span.town_population').html(town.getAvailablePopulation());
			res = town.resources();
			i = resources.length;

			while (i--) {
				const id = resources[i];

				$elem = $town.find('span.fto_resource_count.' + id + ' span.count');

				if (parseInt(res[id], 10) >= parseInt(res.storage, 10)) {
					$elem.addClass('town_storage_full');
					$elem.html(res.storage);
				} else {
					if ($elem.hasClass('town_storage_full')) {
						$elem.removeClass('town_storage_full');
					}
					$elem.html(res[id]);
				}
			}
		}
	};

	// Mark per row, a booty researched town renders the loyalty values in its default row as well
	WndHandlerFarmTownOverviews.prototype.restoreTimeSelectionCheckbox = function () {
		if (!this.selected_time_option || this.selected_unit_option !== null) {
			return;
		}

		const $el = this.wnd.getJQElement(),
			markOption = (row, option) => {
				if (option) {
					$el.find(row + ' .fto_' + option).addClass('active').find('.checkbox').addClass('checked');
				}
			};

		markOption('.time_options_default', this.selected_time_option);
		markOption('.time_options_loyalty', this.selected_time_option_loyalty);
	};

	WndHandlerFarmTownOverviews.prototype.showRibbon = function (time) {
		const $ribbon = $($.find('.ribbon_wrapper'));

		$ribbon.removeClass('hidden');
		$ribbon.find('.unlock_time').text(time);
	};

	WndHandlerFarmTownOverviews.prototype.hideRibbon = function () {
		$($.find('.ribbon_wrapper')).addClass('hidden');
	};

	WndHandlerFarmTownOverviews.prototype.toggleRibbon = function () {
		if (this.isAtLeastOneFarmActive() || $('.fto_list_entry.owned').length === 0) {
			this.hideRibbon();
		} else {
			const filtered_farm_towns = this.getLootingFarmTowns(),
				next_lootable_farm_town = filtered_farm_towns.reduce(function (prev_farm_town, current_farm_town) {
					return prev_farm_town.loot < current_farm_town.loot ? prev_farm_town : current_farm_town;
				});

			this.showRibbon(next_lootable_farm_town.lootable_human);
		}
	};

	WndHandlerFarmTownOverviews.prototype.getButtonCaption = function () {
		const checked_count = this.selected_towns_count || 1;

		if (this.selected_unit_option !== null) {
			return ngettext(__('verb|Recruit'), _('Recruit all'), checked_count);
		} else if (this.pillage_menu) {
			return ngettext(_('Loot'), _('Loot all'), checked_count);
		} else if (Features.battlepointVillagesEnabled()) {
			return ngettext(__('verb|Collect'), _('Collect all'), checked_count);
		}

		return ngettext(__('verb|Demand'), _('Demand all'), checked_count);
	};

	WndHandlerFarmTownOverviews.prototype.bindSelectAll = function () {
		const $wrapper = $('.checkbox_wrapper');

		$wrapper.tooltip($wrapper.text().trim());

		$('.checkbox.select_all').off().on('click', function (e) {
			const $target = $(e.target),
				$checkboxes = this.$town_list.find('.town_checkbox'),
				is_checked = $target.toggleClass('checked').hasClass('checked'),
				seen_islands = new Set();

			// Only one town per island can be selected, so check the first visible town
			// per island. Using DOM position keeps it in sync with the current sort/filter.
			$checkboxes.each(function (index, el) {
				const $el = $(el),
					island_id = $el.data('island_id');

				if (is_checked && $el.is(':visible') && !seen_islands.has(island_id)) {
					seen_islands.add(island_id);
					$el.addClass('checked');
				} else {
					$el.removeClass('checked');
				}
			});

			this.handleSelectedTownsChange();
		}.bind(this));
	};

	WndHandlerFarmTownOverviews.prototype.handleTownCheckboxClick = function ($checkbox) {
		const island_id = $checkbox.data('island_id'),
			$select_all = $('.checkbox.select_all');

		$select_all.toggleClass('checked', false);

		if (!$checkbox.hasClass('checked')) {
			const $town_checkboxes = this.$town_list.find('.town_checkbox[data-island_id="' + island_id + '"]');

			$town_checkboxes.each(function (index, el) {
				$(el).removeClass('checked');
			});
		}

		$checkbox.toggleClass('checked');
		this.handleSelectedTownsChange();
	};

	WndHandlerFarmTownOverviews.prototype.handleSelectedTownsChange = function () {
		this.selected_towns_count = this.$town_list.find('.town_checkbox.checked').length;

		// Both branches re-render the whole wrapper, so the footer switches in one step with the response
		if (this.selected_towns_count > 0) {
			this.getFarmTownsFromMultipleTowns();
		} else {
			this.getFarmTownsForCurrentIsland();
		}

		CM.get(this.wnd.getContext(), 'claim_button').setCaption(this.getButtonCaption());
	};

	WndHandlerFarmTownOverviews.prototype.getFarmTownsFromMultipleTowns = function () {
		const selected_cities = this.getSelectedTowns();

		this.wnd.ajaxRequestGet(
			'farm_town_overviews',
			'get_farm_towns_from_multiple_towns',
			{town_ids: selected_cities},
			function (_wnd, data) {
				this.towns_data = data.towns_data;

				this.multiple_towns_upgrade_cost = data.upgrade_all_cost || 0;
				this.available_battle_points = data.available_battle_points || 0;

				this.wnd.getJQElement().find('#farm_town_wrapper').html(data.html);

				this.selected_time_option = $('.time_options_default .fto_time_checkbox.active').data('option');
				this.selected_time_option_loyalty = $('.time_options_loyalty .fto_time_checkbox.active').data('option');

				this.bindOptionsClick();
				this.calculateResourcesForMultipleTowns();
				this.registerBattlePointButtons();
			}.bind(this)
		);
	};

	WndHandlerFarmTownOverviews.prototype.calculateResourcesForMultipleTowns = function () {
		this.max_resources = 0;

		this.$town_list.find('.town_checkbox.checked').each(function (index, el) {
			const town_id = $(el).data('town_id'),
				loads_data = this.towns_data[town_id].loads_data;

			if (this.selected_time_option_loyalty && loads_data[this.selected_time_option_loyalty]) {
				this.max_resources += loads_data[this.selected_time_option_loyalty];
			} else if (this.selected_time_option && loads_data[this.selected_time_option]) {
				this.max_resources += loads_data[this.selected_time_option];
			}
		}.bind(this));

		$('#max_claim_resources').html('+' + this.max_resources);
		this.changeUnitAmounts();
	};

	WndHandlerFarmTownOverviews.prototype.getSelectedTowns = function () {
		const result = [];

		this.$town_list.find('.town_checkbox.checked').each(function (index, el) {
			result.push($(el).data('town_id'));
		});

		return result;
	};

	WndHandlerFarmTownOverviews.prototype.handleClaimLoadsMultiple = function () {
		if (this.selected_towns_count <= 0) {
			return;
		}

		ConfirmationWindowFactory.openConfirmationWasteResourcesFarmTowns(this.claimLoadsMultiple.bind(this), null);
	};

	WndHandlerFarmTownOverviews.prototype.bindScrollHandler = function () {
		this.$town_list.off('scroll').on('scroll', this.setItemsHidden.bind(this));
	};

	WndHandlerFarmTownOverviews.prototype.bindFiltering = function () {
		// Initialise every widget from the retained filter/sort state (mirroring the
		// fallbacks in filterAndSortTowns) so the toolbar stays in sync with the list
		// when bindFiltering runs again after a multi-town claim or window reopen.
		const local_root = this.wnd.getJQElement(),
			context = this.wnd.getContext(),
			active_group_id = this.town_group_id === null ?
				MM.getCollections().TownGroup[0].getActiveGroupId() : this.town_group_id,
			sort_by = this.sort_by || SORT_BY.NAME,
			sort_direction = this.sorting_direction || this.getDefaultSortDirection(sort_by);

		CM.unregister(context, 'dd_fto_select_town_group');
		CM.register(context, 'dd_fto_select_town_group', local_root.find('#dd_fto_select_town_group').dropdown({
			initial_message: this.l10n.select_town_group,
			options: MM.getCollections().TownGroup[0].getTownGroupsForDropdown(),
			value: active_group_id,
			list_pos: 'left'
		}).on('dd:change:value', this.onSelectTownGroupValueChange.bind(this)));

		CM.unregister(context, 'dd_fto_sort_by');
		CM.register(context, 'dd_fto_sort_by', local_root.find('#dd_fto_sort_by').dropdown({
			initial_message: this.l10n.sort_by.description,
			value: sort_by,
			options: [{value: SORT_BY.NAME, name: this.l10n.sort_by.name}, {
				value: SORT_BY.POINTS, name: this.l10n.sort_by.points
			}, {value: SORT_BY.POPULATION, name: this.l10n.sort_by.population}, {
				value: SORT_BY.STORAGE, name: this.l10n.sort_by.storage
			}]
		}).on('dd:change:value', this.onSelectSortByValueChange.bind(this)));

		CM.unregister(context, 'btn_fto_direction');
		CM.register(context, 'btn_fto_direction', local_root.find('#btn_fto_direction').button({
			toggle: true, state: sort_direction === SORT_DIRECTION.DESC
		}).on('btn:click:even', this.onButtonSortingDirectionClickEven.bind(this))
			.on('btn:click:odd', this.onButtonSortingDirectionClickOdd.bind(this)));

		CM.unregister(context, 'txt_fto_search');
		CM.register(context, 'txt_fto_search', local_root.find('#txt_fto_search').textbox({
			initial_message: this.l10n.search_by, value: this.search_for || '', clear_msg_button: true, live: true
		}).on('txt:change:value', this.onTextboxFilterChangeValue.bind(this)));
	};

	WndHandlerFarmTownOverviews.prototype.onSelectTownGroupValueChange = function (e, new_val) {
		this.town_group_id = parseInt(new_val, 10);
		this.filterAndSortTowns();
	};

	WndHandlerFarmTownOverviews.prototype.onSelectSortByValueChange = function (e, new_val) {
		this.sort_by = new_val;
		// Reset the manually toggled direction so the criterion-specific default
		// applies again (name -> asc, numeric -> desc), and sync the toggle button
		// so its next click flips the direction as the user expects.
		this.sorting_direction = null;

		const direction_button = CM.get(this.wnd.getContext(), 'btn_fto_direction');

		if (direction_button) {
			direction_button.setState(this.getDefaultSortDirection(new_val) === SORT_DIRECTION.DESC);
		}

		this.filterAndSortTowns();
	};

	WndHandlerFarmTownOverviews.prototype.onButtonSortingDirectionClickEven = function () {
		this.sorting_direction = SORT_DIRECTION.ASC;
		this.filterAndSortTowns();
	};

	WndHandlerFarmTownOverviews.prototype.onButtonSortingDirectionClickOdd = function () {
		this.sorting_direction = SORT_DIRECTION.DESC;
		this.filterAndSortTowns();
	};

	WndHandlerFarmTownOverviews.prototype.onTextboxFilterChangeValue = function (e, new_val) {
		this.search_for = this.sanitizeSearchTerm(new_val);
		this.filterAndSortTowns();
	};

	WndHandlerFarmTownOverviews.prototype.sanitizeSearchTerm = function (value) {
		if (!value) {
			return '';
		}

		return value.toString().replace(/[^\p{L}\p{N}\s'.\-?*=]/gu, '').trim(); // jshint ignore:line
	};

	WndHandlerFarmTownOverviews.prototype.getDefaultSortDirection = function (sort_by) {
		return (sort_by === SORT_BY.NAME) ? SORT_DIRECTION.ASC : SORT_DIRECTION.DESC;
	};

	WndHandlerFarmTownOverviews.prototype.getFilteredTowns = function (active_group_id, search_term) {
		const $towns = this.$town_list.find('li.fto_town'),
			all_group_id = Game.constants.ui.town_group.all_group_id,
			town_group_towns = MM.getCollections().TownGroupTown[0],
			visible_towns = [];

		$towns.each(function (index, town_el) {
			const $town = $(town_el),
				town_id = parseInt($town.data('town_id'), 10),
				town_obj = ITowns.getTown(town_id);
			let is_visible = true;

			if (!town_obj) {
				$town.hide();

				return;
			}

			// Filter by town group
			if (active_group_id !== all_group_id && !town_group_towns.hasTown(active_group_id, town_id)) {
				is_visible = false;
			}

			// Filter by search term
			if (is_visible && search_term) {
				if (town_obj.getName().toLowerCase().indexOf(search_term.toLowerCase()) === -1) {
					is_visible = false;
				}
			}

			if (is_visible) {
				$town.show();
				visible_towns.push({
					id: town_id,
					el: town_el,
					town: town_obj
				});
			} else {
				$town.hide();
			}
		});

		return visible_towns;
	};

	WndHandlerFarmTownOverviews.prototype.groupTownsByIsland = function (visible_towns) {
		const towns_by_island = {};

		visible_towns.forEach(function (town_data) {
			const $town = $(town_data.el),
				island_key = $town.data('island_x') + '_' + $town.data('island_y');

			if (!towns_by_island[island_key]) {
				towns_by_island[island_key] = {
					towns: [],
					island_header: $town.prevAll('li.fto_island:first')
				};
			}

			towns_by_island[island_key].towns.push(town_data);
		});

		return towns_by_island;
	};

	WndHandlerFarmTownOverviews.prototype.sortTowns = function (towns, sort_by, sort_dir) {
		return towns.slice().sort(function (a, b) {
			let val_a,
				val_b,
				result;

			switch (sort_by) {
				case SORT_BY.POINTS:
					val_a = a.town.getPoints() || 0;
					val_b = b.town.getPoints() || 0;
					break;
				case SORT_BY.POPULATION:
					val_a = a.town.getAvailablePopulation() || 0;
					val_b = b.town.getAvailablePopulation() || 0;
					break;
				case SORT_BY.STORAGE:
					val_a = a.town.getStorage() || 0;
					val_b = b.town.getStorage() || 0;
					break;
				default:
					val_a = a.town.getName() || '';
					val_b = b.town.getName() || '';
			}

			if (typeof val_a === 'string') {
				result = val_a.localeCompare(val_b, undefined, {sensitivity: 'base', numeric: true});
			} else {
				result = val_a - val_b;
			}

			return sort_dir === SORT_DIRECTION.ASC ? result : -result;
		});
	};

	WndHandlerFarmTownOverviews.prototype.reorderTownsInDOM = function (towns_by_island) {
		Object.keys(towns_by_island).forEach(function (island_key) {
			const island_group = towns_by_island[island_key];
			let $anchor = island_group.island_header;

			if (!$anchor || !$anchor.length) {
				return;
			}

			island_group.towns.forEach(function (town_data) {
				$anchor.after(town_data.el);
				$anchor = $(town_data.el);
			});
		});
	};

	WndHandlerFarmTownOverviews.prototype.updateIslandHeaderVisibility = function () {
		this.$town_list.find('li.fto_island').each(function (index, island_el) {
			let $next_sibling = $(island_el).next(),
				has_visible_town = false;

			while ($next_sibling.length && !$next_sibling.hasClass('fto_island')) {
				if ($next_sibling.hasClass('fto_town') && $next_sibling.is(':visible')) {
					has_visible_town = true;
					break;
				}

				$next_sibling = $next_sibling.next();
			}

			$(island_el).toggle(has_visible_town);
		});
	};

	WndHandlerFarmTownOverviews.prototype.filterAndSortTowns = function () {
		if (!this.$town_list) {
			return;
		}

		const active_group_id = this.town_group_id === null ?
				MM.getCollections().TownGroup[0].getActiveGroupId() : this.town_group_id,
			search_term = this.search_for || '',
			sort_by = this.sort_by || SORT_BY.NAME,
			sort_dir = this.sorting_direction || this.getDefaultSortDirection(sort_by);

		// Step 1: Filter towns by group and search term
		const visible_towns = this.getFilteredTowns(active_group_id, search_term);

		this.$town_count.text(visible_towns.length);

		// Step 2: Group towns by island, sort within each island and reorder them
		if (visible_towns.length > 0) {
			const towns_by_island = this.groupTownsByIsland(visible_towns);

			Object.keys(towns_by_island).forEach(function (island_key) {
				const island_group = towns_by_island[island_key];

				island_group.towns = this.sortTowns(island_group.towns, sort_by, sort_dir);
			}.bind(this));

			this.reorderTownsInDOM(towns_by_island);
		}

		// Step 3: Update island header visibility and viewport visibility
		this.updateIslandHeaderVisibility();
		this.setItemsHidden();
	};

	WndHandlerFarmTownOverviews.prototype.setItemsHidden = function () {
		const $items = this.$town_list.find('li.fto_town'),
			visible_area_bottom = this.$town_list.outerHeight();

		$items.toArray().forEach(function (item) {
			const $item = $(item),
				position = $item.position();
			let visible;

			position.bottom = position.top + $item.outerHeight(true);

			visible = (position.top >= 0 && position.top <= visible_area_bottom) ||
				(position.bottom >= 0 && position.bottom <= visible_area_bottom);

			$item.toggleClass('hidden', !visible);
		});
	};

	GPWindowMgr.addWndType('FARM_TOWN_OVERVIEWS', null, WndHandlerFarmTownOverviews, 1);
}());
