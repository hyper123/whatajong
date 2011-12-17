/*global Raphael, io, Tile*/

var socket;

$(function () {
  var SIDE_SIZE = 8
    , TILE_HEIGHT = 65
    , TILE_WIDTH = 45
    , TILE_THEIGHT = TILE_HEIGHT + SIDE_SIZE
    , TILE_TWIDTH = TILE_WIDTH + SIDE_SIZE
    , COLUMNS = 8
    , ROWS = 15
    , ALPHA_HIDE = 0.25
    , CANVAS_WIDTH = (ROWS * TILE_WIDTH) + (2 * SIDE_SIZE)
    , CANVAS_HEIGHT = (COLUMNS * TILE_HEIGHT) + (2 * SIDE_SIZE)
    , paper = Raphael($('#canvas').get(0), CANVAS_WIDTH, CANVAS_HEIGHT)
    , room_host_id = $('#room_host_id').val()
    , namespace_id = $('#namespace_id').val()
    , user_data = { _id: $('#user_id').val()
                  , name: $('#user_name').val()
                  , img: $('#user_picture').val()
                  }
    , emit
    , svgs = [], images = [], shapes = [], shadows = [];

  socket = io.connect('/' + namespace_id);

  emit = _.bind(socket.emit, socket);
  //if (document.location.hostname === 'localhost') {
  //  emit = function (ev) {
  //    var args = arguments;
  //    setTimeout(function () {
  //      socket.emit.apply(socket, args);
  //    }, 5000);
  //  };
  //}

  /**
   * Adds the new player to the room view
   * unless its yourself
   *
   * @param {Object} user
   */
  function _addPlayer(user) {
    $('.players.sidebar li.unknown')
      .eq(0)
      .attr('class', 'player player_' + user.id)
      .html('<img src="' + user.img + '" title="' + user.name +
            '" alt="' + user.name + '" width="48" height="48" />')
      .append('<div style="background: ' + user.color + ';"></div>')
      .append('<span class="points" style="background: rgba('
              + user.rgba_color.join(',') + ',0.5);">' + user.num_pairs + '</span>');

    if (room_host_id && user.id === room_host_id) {
      $('.player_' + user.id).append('<span class="host">host</span>');
    }
  }

  /**
   * Formats the time with leading zeros
   *
   * @param {Number} val
   * @return {String}
   */
  function _formatTime(val) {
    var hours = val / 3600 | 0
      , minutes = (val - (hours * 3600)) / 60 | 0
      , seconds = val - (hours * 3600) - (minutes * 60)
      , hours_s = hours < 10 ? "0" + hours : hours
      , minutes_s = minutes < 10 ? "0" + minutes : minutes
      , seconds_s = seconds < 10 ? "0" + seconds : seconds;

    hours_s = hours === 0 ? "" : hours_s + ":";

    return hours_s + minutes_s + ":" + seconds_s;
  }

  /**
   * Updates the number of pairs remaning
   *
   * @param {String} cardface
   */
  function _numPairsChanged(num_pairs) {
    $('#num_pairs').html(num_pairs + '<span>' + (num_pairs === 1 ? 'move' : 'moves') + ' left</span>');

    if (num_pairs < 3) {
      $('#num_pairs').css({color: '#f53', 'text-shadow': '0px 0px 3px #f53'}, 300);
    } else if (num_pairs < 5) {
      $('#num_pairs').css({color: '#fd3', 'text-shadow': '0px 0px 2px #fd3'}, 300);
    } else {
      $('#num_pairs').css({color: 'rgba(0, 0, 0, 0.4)', 'text-shadow': '0px 0px 1px rgba(0, 200, 0, 0.4)'}, 300);
    }
  }

  /**
   * Gets the clipping rectangle for the image given a cardface
   *
   * @param {String} cardface
   * @return {Object}
   */
  function _getImageLocation(cardface) {
    var type = cardface.slice(0, 1)
      , number = cardface.slice(1, 2);

    switch (type) {
    case 'b':
      return {y: 0, x: (+number - 1) * TILE_WIDTH};
    case 'c':
      return {y: TILE_HEIGHT, x: (+number - 1) * TILE_WIDTH};
    case 'o':
      return {y: 2 * TILE_HEIGHT, x: (+number - 1) * TILE_WIDTH};
    case 'h':
      return {y: 3 * TILE_HEIGHT, x: (+number - 1) * TILE_WIDTH};
    case 'w':
      return {y: 4 * TILE_HEIGHT, x: (+number + 2) * TILE_WIDTH};
    case 'd':
      switch (number) {
      case 'c':
        return {y: 4 * TILE_HEIGHT, x: 0};
      case 'f':
        return {y: 4 * TILE_HEIGHT, x: TILE_WIDTH};
      case 'p':
        return {y: 4 * TILE_HEIGHT, x: 2 * TILE_WIDTH};
      }
    }
  }

  /**
   * Calculates the coordinates of the tile
   *
   * @param {Object} tile
   * @return {Object}
   */
  function _getRealCoordinates(tile) {
    var x = (tile.x - 1) * TILE_WIDTH / 2 | 0
      , y = SIDE_SIZE + (tile.y * TILE_HEIGHT / 2 | 0)
      , z = tile.z;

    x = z ? x + (z * SIDE_SIZE) : x;
    y = z ? y - (z * SIDE_SIZE) : y;

    return {x: x, y: y};
  }

  /**
   * Set the winners to the DOM
   *
   * @param {Object} players
   * @return {Array}
   */
  function setRanking(id, data) {
    var top = _.max(_.pluck(data.players, 'num_pairs'))
      , $ranking = $(id).find('.ranking')
      , sorted = _.sortBy(data.players, function (player) {
          return -player.num_pairs;
        });

    $ranking.html('');

    _.each(sorted, function (player) {
      $ranking.append($('.sidebar .player_' + player.id).clone());

      if (room_host_id && player.num_pairs === top) {
        $ranking.find('.player_' + player.id).append('<img class="medal" src="/images/medal.png" />');
      } else if (room_host_id) {
        $(id).find('total_score').html(data.points + ' points');
      }
    });
  }

  /**
   * Inits the state and set up the board
   *
   * @param {Object} STATE
   */
  function initGame(STATE) {
    var TILE = Tile(STATE.current_map);

    function setShadows(tile) {
      var shadow = shadows[tile.i]
        , up = TILE.getUpTiles(tile)
        , right = TILE.getRightTiles(tile)
        , some
        , has_living_up = false
        , has_living_right = false;

      // init
      shadow.up.show();
      shadow.right.show();
      _.each(['up_both', 'right_both', 'up_climb', 'right_climb'], function (el) {
        shadow[el].hide();
      });

      // check up
      _.each(up, function (el) {
        if (!STATE.tiles[el].is_deleted) {
          shadow.up.hide();
          has_living_up = true;
        }
      });

      // check right
      _.each(right, function (el) {
        if (!STATE.tiles[el].is_deleted) {
          shadow.right.hide();
          has_living_right = true;
        }
      });

      // check right-up
      if (!has_living_up) {
        shadow.up_both.show();
        shadow.up_climb.show();
        some = _.some(right, function (el) {
          var some = _.some(TILE.getUpTiles(STATE.tiles[el]), function (el) {
            return !STATE.tiles[el].is_deleted;
          });

          return some;
        });

        if (!some) {
          shadow.up_climb.hide();
        } else {
          shadow.up_both.hide();
        }
      }

      // check up-right
      if (!has_living_right) {
        shadow.right_both.show();
        shadow.right_climb.show();
        some = _.some(up, function (el) {
          var some = _.some(TILE.getRightTiles(STATE.tiles[el]), function (el) {
            return !STATE.tiles[el].is_deleted;
          });

          return some;
        });

        if (!some) {
          shadow.right_climb.hide();
        } else {
          shadow.right_both.hide();
        }
      }
    }

    function makeBetterVisibility(tile, val) {
      var left_tiles = TILE.getLeftTiles(tile);

      function hide(left_top, left) {
        var covering_top = TILE.getTopCoveringTile(STATE.tiles[left]);

        if (!left_top.is_deleted || !val) {
          svgs[left_top].attr({opacity: val ? ALPHA_HIDE : 1});
          if (left_top === covering_top && val) {
            images[left].attr({opacity: 0});
          }
        }
      }

      function top(left) {
        var left_tops = TILE.getTopTiles(STATE.tiles[left]);

        // handles the edge case when the top_tile is deleted
        // but we need to recover the alpha
        if (!val) {
          images[left].attr({opacity: 1});
        }

        _.each(left_tops, function (left_top) {
          hide(left_top, left);
          top(left_top);
        });
      }

      _.each(left_tiles, top);
    }

    function paintAsSelected(tile, color) {
      if (!shapes[tile.i].removed) {
        shapes[tile.i].attr({fill: color || STATE.players[tile.player_id].color, 'fill-opacity': 0.5});
      }
    }

    function paintAsUnselected(tile) {
      if (!shapes[tile.i].removed) {
        shapes[tile.i].attr({fill: '#FFFFFF', 'fill-opacity': 0});
      }
    }

    function onUnselected(tile) {
      if (!shapes[tile.i].removed) {
        svgs[tile.i].animate({
          '20%': {transform: 'T3,0'}
        , '40%': {transform: 'T-3,0'}
        , '60%': {transform: 'T3,0'}
        , '80%': {transform: 'T-3,0'}
        , '100%': {transform: 'T0,0'}
        }, 250, 'linear');

        setTimeout(function () {
          paintAsUnselected(tile);
        }, 200);
      }
    }

    function onDelete(tile) {
      function shadowing(tile) {
        _.each(TILE.getLeftTiles(tile), function (el) {
          if (!STATE.tiles[el].is_deleted) {
            setShadows(STATE.tiles[el]);
            _.each(TILE.getDownTiles(STATE.tiles[el]), function (el) {
              if (!STATE.tiles[el].is_deleted) {
                setShadows(STATE.tiles[el]);
              }
            });
          }
        });

        _.each(TILE.getDownTiles(tile), function (el) {
          if (!STATE.tiles[el].is_deleted) {
            setShadows(STATE.tiles[el]);
            _.each(TILE.getLeftTiles(STATE.tiles[el]), function (el) {
              if (!STATE.tiles[el].is_deleted) {
                setShadows(STATE.tiles[el]);
              }
            });
          }
        });
      }

      svgs[tile.i].animate({opacity: 0}, 200, '>', function () {
        shadowing(tile);
        svgs[tile.i].remove();
      });
      makeBetterVisibility(tile, false);
    }

    function renderTile(tile) {
      var coords = _getRealCoordinates(tile)
        , x = coords.x
        , y = coords.y
        , z = tile.z
        , shadow_attr = {stroke: '', fill: '#000', 'fill-opacity': 0.1}
        , set = paper.set()
        , image_loc = _getImageLocation(tile.cardface)
        , left_side, bottom_side, body, shape, shadow_right, shadow_up
        , shadow_up_climb, shadow_right_climb, shadow_up_both, shadow_right_both, image;

      left_side = paper.path([ 'M', x, y + SIDE_SIZE, 'L', x + SIDE_SIZE, y, 'L', x + SIDE_SIZE, y + TILE_HEIGHT
                             , 'L', x, y + TILE_THEIGHT, 'L', x, y + SIDE_SIZE].join(' '));
      bottom_side = paper.path([ 'M', x, y + TILE_THEIGHT, 'L', x + SIDE_SIZE, y + TILE_HEIGHT
                               , 'L', x + TILE_TWIDTH, y + TILE_HEIGHT, 'L', x + TILE_WIDTH, y + TILE_THEIGHT
                               , 'L', x, y + TILE_THEIGHT].join(' '));
      body = paper.path([ 'M', x + SIDE_SIZE, y, 'L', x + TILE_TWIDTH, y, 'L', x + TILE_TWIDTH, y + TILE_HEIGHT
                        , 'L', x + SIDE_SIZE, y + TILE_HEIGHT, 'L', x + SIDE_SIZE, y].join(' '));
      image = paper.image("/images/tiles.png", x + SIDE_SIZE - image_loc.x, y - image_loc.y, TILE_WIDTH * 9, TILE_HEIGHT * 5);
      shape = paper.path([ 'M', x, y + SIDE_SIZE, 'L', x + SIDE_SIZE, y, 'L', x + TILE_TWIDTH, y
                         , 'L', x + TILE_TWIDTH, y + TILE_HEIGHT, 'L', x + TILE_WIDTH, y + TILE_THEIGHT
                         , 'L', x, y + TILE_THEIGHT, 'L', x, y + SIDE_SIZE].join(' '));
      shadow_up = paper.path([ 'M', x + SIDE_SIZE, y, 'L', x + (2 * SIDE_SIZE), y - SIDE_SIZE
                             , 'L', x + TILE_TWIDTH - SIDE_SIZE, y - SIDE_SIZE, 'L', x + TILE_TWIDTH - SIDE_SIZE, y
                             , 'L', x + SIDE_SIZE, y].join(' '));
      shadow_up_climb = paper.path([ 'M', x + TILE_TWIDTH - SIDE_SIZE, y - SIDE_SIZE, 'L', x + TILE_TWIDTH, y - SIDE_SIZE * 2
                                   , 'L', x + TILE_TWIDTH, y, 'L', x + TILE_TWIDTH - SIDE_SIZE, y
                                   , 'L', x + TILE_TWIDTH - SIDE_SIZE, y - SIDE_SIZE].join(' '));
      shadow_right_climb = paper.path([ 'M', x + TILE_TWIDTH, y, 'L', x + TILE_TWIDTH + 2 * SIDE_SIZE, y
                                      , 'L', x + TILE_TWIDTH + SIDE_SIZE, y + SIDE_SIZE, 'L', x + TILE_TWIDTH, y + SIDE_SIZE
                                      , 'L', x + TILE_TWIDTH, y].join(' '));
      shadow_up_both = paper.path([ 'M', x + TILE_TWIDTH - SIDE_SIZE, y - SIDE_SIZE, 'L', x + TILE_TWIDTH + SIDE_SIZE, y - SIDE_SIZE
                                  , 'L', x + TILE_TWIDTH, y, 'L', x + TILE_TWIDTH - SIDE_SIZE, y
                                  , 'L', x + TILE_TWIDTH - SIDE_SIZE, y - SIDE_SIZE].join(' '));
      shadow_right_both = paper.path([ 'M', x + TILE_TWIDTH, y, 'L', x + TILE_TWIDTH + SIDE_SIZE, y - SIDE_SIZE
                                     , 'L', x + TILE_TWIDTH + SIDE_SIZE, y + SIDE_SIZE, 'L', x + TILE_TWIDTH, y + SIDE_SIZE
                                     , 'L', x + TILE_TWIDTH, y - SIDE_SIZE].join(' '));
      shadow_right = paper.path([ 'M', x + TILE_TWIDTH, y + SIDE_SIZE, 'L', x + TILE_TWIDTH + SIDE_SIZE, y + SIDE_SIZE
                                , 'L', x + TILE_TWIDTH + SIDE_SIZE, y + TILE_HEIGHT - SIDE_SIZE
                                , 'L', x + TILE_TWIDTH, y + TILE_HEIGHT, 'L', x + TILE_TWIDTH, y + SIDE_SIZE
                                ].join(' '));

      left_side.attr({fill: '#FFBB89', stroke: '', cursor: 'pointer'});
      bottom_side.attr({fill: '#FF9966', stroke: '', cursor: 'pointer'});
      body.attr({fill: '#FEE1A9', stroke: '', cursor: 'pointer'});
      image.attr({'clip-rect': [x + SIDE_SIZE, y, TILE_WIDTH, TILE_HEIGHT], cursor: 'pointer'});
      shape.attr({stroke: '#520', 'stroke-width': 1, cursor: 'pointer', fill: '#fff', 'fill-opacity': 0});

      $.each([ shadow_up, shadow_right, shadow_up_climb, shadow_right_climb
             , shadow_up_both, shadow_right_both], function (i, el) {
        el.attr(shadow_attr);
        el.node.style['pointer-events'] = 'none';
      });

      set.push(left_side, bottom_side, body, image, shape
              , shadow_up, shadow_right, shadow_up_climb, shadow_right_climb
              , shadow_up_both, shadow_right_both);

      svgs[tile.i] = set;
      images[tile.i] = image;
      shapes[tile.i] = shape;
      shadows[tile.i] = {
        up: shadow_up
      , right: shadow_right
      , up_climb: shadow_up_climb
      , right_climb: shadow_right_climb
      , up_both: shadow_up_both
      , right_both: shadow_right_both
      };

      shape.click(function (event) {
        TILE.onClicked(STATE
        , function firstSelection(tile) {
            document.getElementById('s_click').play();
            paintAsSelected(tile, STATE.players[user_data._id].color);
            emit('tile.clicked', {tile: tile, player_id: user_data._id});
          }
        , function onDelete(tile, selected_tile, points) {
            paintAsSelected(tile, STATE.players[user_data._id].color);
            _.each([tile, selected_tile], function (t) {
              svgs[t.i].animate({opacity: 0}, room_host_id ? 200 : 50, '>');
            });

            if (!room_host_id) {
              document.getElementById('s_gling').play();
            }

            emit('tile.clicked', {tile: tile, player_id: user_data._id}, function (tile, selected_tile) {
              STATE.tiles[selected_tile.i].is_deleted = false;
              _.each(_.filter([tile, selected_tile], Boolean), function (t) {
                if (!t.is_deleted) {
                  svgs[t.i].attr({opacity: 1});
                  if (t.selected) {
                    paintAsSelected(t, STATE.players[t.player_id].color);
                  } else {
                    paintAsUnselected(t);
                  }
                }
              });
            });
          }
        , function notMatching(tile, selected_tile) {
            document.getElementById('s_grunt').play();
            if (selected_tile.i !== tile.i) {
              paintAsSelected(tile, STATE.players[user_data._id].color);
              onUnselected(selected_tile);
            }
            onUnselected(tile);
            emit('tile.clicked', {tile: tile, player_id: user_data._id});
          }
        )(tile, user_data._id);
      });

      shape.hover(function () {
        if (!STATE.tiles[tile.i].player_id && TILE.isFree(STATE.tiles[tile.i])) {
          this.attr({'fill-opacity': 0.3});
        }
        makeBetterVisibility(STATE.tiles[tile.i], true);
      }, function () {
        if (!STATE.tiles[tile.i].player_id && !STATE.tiles[tile.i].is_deleted) {
          this.attr({'fill-opacity': 0});
        }
        makeBetterVisibility(STATE.tiles[tile.i], false);
      });
    }

    /**
     * Draws the board :)
     *
     * @param {Array} tiles
     */
    function drawBoard(tiles) {
      var i, tile;

      paper.clear();
      for (i = 1; i <= tiles.length; i++) {
        if (tiles[i] && !tiles[i].is_deleted) {
          renderTile(tiles[i]);
          setShadows(tiles[i]);
          if (tiles[i].selected) {
            paintAsSelected(tiles[i]);
          }
        }
      }
    }

    // bootstrap
    $('#time').text('00:00');
    $('#container').removeClass('paused').addClass('playing');

    _.each(STATE.players, function (player) {
      $('.sidebar .player_' + player.id + ' .points').html(player.num_pairs);
    });

    _numPairsChanged(STATE.num_pairs);

    drawBoard(STATE.tiles);

    // game events
    socket.on('tile.selected', function (data) {
      if (!STATE.tiles[data.tile.i].is_deleted) {
        document.getElementById('s_click').play();
        paintAsSelected(data.tile);
      }
    });

    socket.on('tiles.unselected', function (data) {
      var selected_tile = STATE.players[user_data._id].selected_tile || {};

      if (data.selected_tile.i !== selected_tile.i && !STATE.tiles[data.selected_tile.i].is_deleted) {
        paintAsUnselected(data.selected_tile);
        delete STATE.tiles[data.selected_tile.i].player_id;
      }
    });

    socket.on('tiles.deleted', function (data) {
      var selected_tile = STATE.players[user_data._id].selected_tile || {};

      STATE.current_map = data.current_map;
      TILE = Tile(STATE.current_map);
      _numPairsChanged(data.num_pairs);
      $('.sidebar .player_' + data.player_id + ' .points').html(data.player_num_pairs);

      if (room_host_id) {
        document.getElementById('s_gling').play();
      }

      if (data.selected_tile.i !== selected_tile.i || data.tile.i !== selected_tile.i) {
        STATE.players[user_data._id].selected_tile = null;
      }

      _.each([data.tile, data.selected_tile], function (tile) {
        STATE.tiles[tile.i].is_deleted = true;
        delete STATE.tiles[tile.i].player_id;
        onDelete(tile);
      });
    });

    socket.on('tick', function (data) {
      $('#time').text(_formatTime(data.time));
    });

    socket.on('game.win', function (data) {
      setRanking('#win', data);
      APP.Confirm.open($('#win'), function () {
        emit('restart');
      });
    });

    socket.on('game.loose', function (data) {
      setRanking('#loose', data);
      APP.Confirm.open($('#loose'), function () {
        emit('restart');
      });
    });
  }

  // room dom events
  $('.start').click(function () {
    emit('start');
    return false;
  });

  $('#canvas')[0].onselectstart = function () {
    return false;
  };

  $('textarea')
    .text($('textarea').text().replace('URL', document.URL.replace(/\#.*/, '')))
    .click(function () {
      this.select();
    });

  // room socket events
  socket.on('init', initGame);
  socket.on('players.add', _addPlayer);
  socket.on('players.delete', function (user) {
    $('.sidebar .player_' + user.id)
      .attr('id', '')
      .addClass('unknown')
      .html('?');
  });

  emit('connect', user_data, function (error, players) {
    if (error) {
      window.location = '/?connect_error=' + error;
    } else {
      _.each(players, function (user) {
        _addPlayer(user);
      });
    }
  });
});
