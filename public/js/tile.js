(typeof exports === 'undefined' ? this : exports).Tile = function (current_map, sockets) {
  var TILE = {};

  function _getPosition(z, y, x) {
    return ((current_map[z] || {})[y] || {})[x];
  }

  TILE.getTopTiles = function getTopTiles(tile) {
    return _.compact([ _getPosition(tile.z + 1, tile.y, tile.x)
                     , _getPosition(tile.z + 1, tile.y, tile.x - 1)
                     , _getPosition(tile.z + 1, tile.y + 1, tile.x)
                     , _getPosition(tile.z + 1, tile.y + 1, tile.x - 1)]);
  }

  TILE.getLeftTiles = function getLeftTiles(tile) {
    return _.compact([ _getPosition(tile.z, tile.y, tile.x - 2)
                     , _getPosition(tile.z, tile.y + 1, tile.x - 2)]);
  }

  TILE.hasTopTiles = function hasTopTiles(tile) {
    return !!TILE.getTopTiles(tile).length;
  }

  TILE.hasLeftTiles = function hasLeftTiles(tile) {
    return !!TILE.getLeftTiles(tile).length;
  }

  TILE.hasRightTiles = function hasRightTiles(tile) {
    return !!(_getPosition(tile.z, tile.y, tile.x + 1) || _getPosition(tile.z, tile.y + 1, tile.x + 1));
  }

  TILE.isFree = function (tile) {
    return !TILE.hasTopTiles(tile) && (!TILE.hasLeftTiles(tile) || !TILE.hasRightTiles(tile));
  }

  TILE['delete'] = function (tile) {
    tile.is_deleted = true;
    current_map[tile.z][tile.y][tile.x] = null;
    current_map[tile.z][tile.y][tile.x - 1] = null;
    current_map[tile.z][tile.y + 1][tile.x] = null;
    current_map[tile.z][tile.y + 1][tile.x - 1] = null;
    sockets.emit('tile.deleted', tile);
    sockets.emit('map.changed', current_map);
  }

  TILE.setPosition = function (tile, x, y, z) {
    tile.x = x;
    tile.y = y;
    tile.z = z;
  };

  return TILE;
};