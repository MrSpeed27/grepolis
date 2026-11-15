/* globals ITowns, PlaceWindowFactory, GameData, GameEvents, Game, Timestamp, gpAjax, GPWindowMgr,
BuyForGoldWindowFactory, ConfirmationWindowFactory, CM, TooltipFactory */
(function() {
	'use strict';

	var BuildingPlace = {
		celebration_finished_at: {},
		index_data:{},
		wnd_handle:null,
		olympic_games_duration : 0,

		renderIndex: function (wnd) {
			BuildingPlace.wnd_handle = wnd;
			wnd.setContent2(us.template(GameData.BuildingPlaceTemplate)(BuildingPlace.index_data));
			$('a.place_sendback_all').tooltip('<strong>' + _('Return units') + '</strong>');
			$('#place_defense .return_all_units').tooltip(_('Send back all supporting units'));

			TooltipFactory.setAllUnitCardTooltips($('.place_units .unit'));
		},

		handleEvents: function(current_tab, wnd){
			switch(current_tab){
				case 'index':
					var i,unit_id;
					var units = ITowns.getTown(Game.townId).units(),
						data_units = GameData.units;

					BuildingPlace.index_data.all_units = {};
					BuildingPlace.index_data.player_units = {};
					for(unit_id in data_units){
						if (data_units.hasOwnProperty(unit_id)) {
							BuildingPlace.index_data.all_units[unit_id] = 0;
							BuildingPlace.index_data.player_units[unit_id] = 0;
						}
					}

					for(i in BuildingPlace.index_data.support_array){
						if (BuildingPlace.index_data.support_array.hasOwnProperty(i)) {
							var support = BuildingPlace.index_data.support_array[i];

							for(unit_id in support.units){
								if (support.units.hasOwnProperty(unit_id)) {
									BuildingPlace.index_data.all_units[unit_id] += support.units[unit_id];
								}
							}
						}
					}

					for(unit_id in units) {
						if(units.hasOwnProperty(unit_id)) {
							if(!window.isNumber(units[unit_id]) || units[unit_id] === 0){
								continue;
							}
							BuildingPlace.index_data.player_units[unit_id] += units[unit_id];
							BuildingPlace.index_data.all_units[unit_id] += units[unit_id];
						}
					}

					for(unit_id in data_units){
						if (data_units.hasOwnProperty(unit_id)) {
							if(BuildingPlace.index_data.all_units[unit_id] === 0){
								delete BuildingPlace.index_data.all_units[unit_id];
							}
							if(BuildingPlace.index_data.player_units[unit_id] === 0){
								delete BuildingPlace.index_data.player_units[unit_id];
							}
						}
					}

					BuildingPlace.renderIndex(BuildingPlace.wnd_handle);
					break;
				default:
					break;
			}
		},

		startCountdown: function() {
			var that = this;
			$.each(this.celebration_finished_at, function(type, at){
				if (at > Timestamp.now()) {
					var current_celebration = $('#countdown_' + type);
					current_celebration.countdown(at, {});

					// Reload on finish
					current_celebration.on('finish', function() {
						gpAjax.ajaxGet('building_place', 'culture', {}, true, function(data){
							if(that.isBuildingPlaceWindowOpen()){
								PlaceWindowFactory.getWnd().setContent2(data.html);
								PlaceWindowFactory.getWnd().getHandler().registerBuildingPlaceComponents();
							}
						});
					});
				}
			});
		},

		/**
		 *
		 * @param celebration_type
		 * @param {jQuery Button Component} [_btn]
		 */
		startCelebration: function(celebration_type, _btn) {
			var that = this;

			// function to be executed if olympic games are confirmed (see below)
			var callback = function() {
				gpAjax.ajaxPost('building_place', 'start_celebration', {celebration_type:celebration_type}, true, function(data) {
					if (typeof data.enough_gold !== 'undefined' && data.enough_gold === false) {

					}
					else {
						$.Observer(GameEvents.celebration.start).publish({celebration_type : celebration_type});

						if (that.isBuildingPlaceWindowOpen()) {
							//Should be 1 window max
							var opened_agora_windows = GPWindowMgr.getByType(GPWindowMgr.TYPE_BUILDING_PLACE);

							//Since components are initialized, we have to request new data again to call 'onRcvData'
							for (var i = 0, l = opened_agora_windows.length; i < l; i++) {
								opened_agora_windows[i].getHandler().refresh();
							}
						}
					}
				});
			};

			if (celebration_type === 'games' && !_btn.hasClass('for_free')) {
				BuyForGoldWindowFactory.openCelebrateOlympicGamesForGoldWindow(_btn, this.olympic_games_duration, callback);
			}
			else {
				callback();
			}
		},

		isBuildingPlaceWindowOpen: function () {
			return PlaceWindowFactory.getWnd() && PlaceWindowFactory.getWnd().getHandler();
		},

		insertUnitsToSimulator: function (units, params) {
			if (typeof params === 'undefined') {
				params = {};
			}
			var id_of_defender_town = params.defender_town_id;

			if (typeof id_of_defender_town === 'undefined') {
				params.defender_town_id = BuildingPlace.defender_town_id;
			}

			PlaceWindowFactory.openPlaceWindow('simulator', {'units': units, 'data': params});
		},

		sendBackAllUnits: function (is_beyond_units, for_all_towns, has_selected_cities) {
			var on_confirm = function () {
				if (is_beyond_units) {
					BuildingPlace.onConfirmSendBackAllUnitsBeyond(for_all_towns);
				} else {
					BuildingPlace.onConfirmSendBackAllUnitsSupport();
				}
			};

			ConfirmationWindowFactory.openConfirmationReturnAllUnits(on_confirm, null, has_selected_cities);
		},

		sendBackSupport: function(support_id) {
			var callback = function (data) {
                var all_units = data.all_units;
                var player_units = data.player_units;
                var support_units = data.support_array;
				var UnitNumbersHelper = require('helpers/short_numbers');

                $('#support_units_' + support_id).remove();

                if ($(support_units).length === 0) {
                    $('#support_units').remove();
                }
                $.each(GameData.units, function(unit) {
                    if (all_units[unit] > 0) {
                        $('#all_units_' + unit + ' span').text(UnitNumbersHelper.shortenNumber(all_units[unit]));
                    } else {
                        $('#all_units_' + unit).remove();
                    }
                    if (player_units[unit] > 0) {
                        $('#player_units' + unit + ' span').text(UnitNumbersHelper.shortenNumber(player_units[unit]));
                    } else {
                        $('#player_units' + unit).remove();
                    }
                });
            };

            ConfirmationWindowFactory.openConfirmationReturnAllUnitsFromTown(function () {
                BuildingPlace.onConfirmSendBack(support_id, callback);
            });
		},

		sendBackBeyond: function(support_id) {
			var callback = function (data) {
                $.Observer(GameEvents.command.support.send_back).publish({support_id : support_id, no_units_html : data.no_units_html});
            };

            ConfirmationWindowFactory.openConfirmationReturnAllUnitsFromTown(function () {
				BuildingPlace.onConfirmSendBack(support_id, callback);
			});
		},

		initSendBackTab: function(researches) {
			this.researches = researches;
			this.registerSpinnerComponents();
			this.registerEventListeners();
		},

		toggleUnitSpinnerValue: function(icon_clicked, units_id) {
			if (!$('#place_send_part_' + units_id).is(':visible')) {
				return;
			}

			var context = BuildingPlace.wnd_handle.getContext(),
				unit_id = $(icon_clicked).data('unit_id');

			context.sub = 'building_place_' + units_id;

			var	spinner = CM.get(context, unit_id);

			if (spinner.getValue()) {
				spinner.setValue(0);
			} else {
				spinner.setValue(parseInt($(icon_clicked).find('span').html(), 10));
			}
		},


		toggle: function (units_id, base_id) {
			base_id = base_id || 'place';

			var $place_send_part_div = $('#' + base_id + '_send_part_' + units_id),
				$unit_list = $place_send_part_div.parent(),
				$place_unit_container = $unit_list.find('.place_unit_container'),
				margin_unit_container_left,
				margin_unit_container_right,
				margin_unit;

			if (!$place_send_part_div.is(':visible')) {
				this.updateCapacityBar(units_id);

				$unit_list.find('div.place_unit.unit').off().on('click', function () {
					BuildingPlace.toggleUnitSpinnerValue(this, units_id);
				});

				margin_unit_container_left = '5px';
				margin_unit_container_right = '5px';
				margin_unit = '19px';
			} else {
				margin_unit_container_left = '0';
				margin_unit_container_right = '0';
				margin_unit = '5px';
			}

			$place_send_part_div.animate({
				height: 'toggle'
			}, 500, function () {});

			$unit_list.find('.spinner_horizontal').animate({
				height: 'toggle'
			}, 500, function () {});

			$unit_list.find('.place_send_part_buttons').animate({
				height: 'toggle'
			}, 500, function () {});

			$place_unit_container.animate({
				marginLeft: margin_unit_container_left,
				marginRight: margin_unit_container_right
			}, 500, 'linear', function () {});

			$place_unit_container.find('.place_unit').animate({
				marginLeft: margin_unit
			}, 500, 'linear', function () {});

			TooltipFactory.setAllUnitCardTooltips($place_unit_container.find('.unit'));
		},

		onConfirmSendBack: function(support_id, callback) {
			gpAjax.ajaxPost('building_place', 'send_back', {support_id: support_id}, false, callback);
		},

		onConfirmSendBackAllUnitsBeyond: function(for_all_towns) {
		    var params = {
		    	'is_beyond': true,
				'for_all_towns': for_all_towns
		    };

			gpAjax.ajaxPost('building_place', 'send_back_all_units', params, false, BuildingPlace.clearOuterUnitsList);
		},

		onConfirmSendBackAllUnitsSupport: function () {
            gpAjax.ajaxPost('building_place', 'send_back_all_units', {'is_beyond': false, 'for_all_towns': false}, false, function (data) {
                var units_array = data.units_array;

                if (units_array.length === 0) {
                    $('#support_units').remove();
                    $('.support_units_from_other_town').remove();
                    $('.return_all_units').remove();
                }
            });
		},

        clearOuterUnitsList: function (data) {
            var $outer_list = $('#outer_troops_list');
            $('.place_units').remove();
            $outer_list.empty();
            $('.return_all_units').remove();
            if (typeof data.no_units_html !== undefined) {
                $('#units_beyond_list').html(data.no_units_html);
                $outer_list.html(data.no_units_html);
            }
        },

		sendBackPart: function(units_id, town_id, base_id) {
			base_id = base_id || 'place';

			var params = {},
				context = BuildingPlace.wnd_handle.getContext(),
				spinners = CM.getSubGroup(context, 'building_place_' + units_id),
				UnitNumbersHelper = require('helpers/short_numbers');

			Object.keys(spinners).forEach(function(unit_name) {
				var spinner = spinners[unit_name];
				params[unit_name] = parseInt(spinner.getValue() || 0, 10);
				spinner.setValue(0);
			});

			params.units_id = units_id;
			params.town_id = town_id;

			BuildingPlace.toggle(units_id, base_id);

			gpAjax.ajaxPost('units_beyond_info', 'send_back_part', params, false, function (data) {
				if (data.close) {
					$('#'+base_id+'_units_' + units_id).remove();
				} else {
					$.each(data.remaining_units, function(name, count) {
						if (count === 0) {
							$('#'+base_id+'_units_' + data.remaining_units.id + ' div.place_unit.unit_' + name).remove();
							$('#'+base_id+'_part_' + data.remaining_units.id + '_' + name).parent().remove();
						} else {
							$('#'+base_id+'_units_' + data.remaining_units.id + ' div.unit_' + name + ' span').text(
								UnitNumbersHelper.shortenNumber(count)
							);
						}
					});
				}
			});
		},

		registerSpinnerComponents: function() {
			var context = this.wnd_handle.getContext(),
				that = this;

			$('#units_beyond_list li').each(function (index, list) {
				$(list).each(function (index_unit_list, unit_list) {
					$(unit_list).find('.place_unit_container').each(function (index_unit_container, unit_container) {
						var $unit_container = $(unit_container),
							$place_unit = $unit_container.find('.place_unit'),
							units_id = $unit_container.data('units_id'),
							unit_count = $place_unit.data('unit_count'),
							unit_id = $place_unit.data('unit_id');

						context.sub = 'building_place_' + units_id;

						CM.unregister(context, unit_id);
						CM.register(
							context,
							unit_id,
							$unit_container.find('.spinner_horizontal').spinnerHorizontal({
								value: 0,
								min: 0,
								step: 1,
								max: unit_count,
								input_name: unit_id
							}).on('sp:change:value', function () {
								that.updateCapacityBar(units_id);
							})
						);
					});
				});
			});
		},

		updateCapacityBar: function(units_id) {
			var $place_send_part = $('#place_send_part_' + units_id),
				$list = $place_send_part.parent(),
				$progress = $list.find('div.progress'),
				units = {};

			$list.find('input').each(function (index, input) {
				var $input = $(input);
				units[$input.attr('name')] = parseInt($input.val()) || 0;
			});

			var calculated_capacity = window.recalcCapacity(
				units,
				this.researches,
				$progress.find('span.capacity_current'),
				$progress.find('span.capacity_max'),
				$list.find('div.progress')
			);

			$progress.toggleClass('overloaded_capacity', calculated_capacity.capacity < calculated_capacity.population);
		},

		registerEventListeners: function() {
			$.Observer(GameEvents.command.support.send_back).subscribe(['building_place_js'], function(event, data) {
				/**
				 * notice: place_units_XXX are in building_place/units_beyond.tpl template;
		 		 * outer_troops_units_XXX in town_overviews/outer_units.tpl
				 */
				var support_units_id = $('#place_units_' + data.support_id),
					$el = support_units_id.length > 0 ? support_units_id : $('#outer_troops_units_' + data.support_id);

				if (!$el.length) {
					return;
				}

				$el.remove();

				if (data.no_units_html !== undefined) {
					// overviews
					$('#outer_troops_list').html(data.no_units_html);
					// agora
					$('#units_beyond_list').html(data.no_units_html);
				}
			});
		}
	};

	window.BuildingPlace = BuildingPlace;
}());
