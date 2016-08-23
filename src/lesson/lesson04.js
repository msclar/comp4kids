/*
 * comp4kids programming 101 lesson 4.
 */

var React = require("react");
var Lesson = require("./lesson");
var Interpreter = require("../language/interpreter")
var Animator = require("../util/animator");
var ResourceLoader = require("../util/resource_loader");
var AnimationFactories = require("../util/animator/animation_factories");
var ElementFactories = require("../util/animator/element_factories");
var Robolang = require("../language/robolang/robolang");
var Constants = require("../constants");
//var Icons = require("../view/icons");
var Grid = require("./utils/grid");

// In this game, the agent will have to detect the presence of a set of
// collectable items in the environment. Those items will then be used to
// unlock passageways. The process repeats until the goal is reached.
// 
// There are conditions that depend solely on the agent, and are not related
// to the environment. For instance, if the agent is a robot that feeds from
// energy from a battery, BATTERY_GOOD could represent the status of the
// battery, and as long as BATTERY_GOOD is not true, the robot cannot take
// actions (i.e., walk) until REPAIR_BATTERY is invoked.
//
// In order to simplify halt checking, there is a limit over the number of
// executed instructions. In other words, when the instruction counter reaches
// some predefined value, it is assumed the robot will not be able to reach the
// goal and the game ends without success.
//
// The agent start in the leftmost part of the map, whereas the goal should be
// far right. Passageway blockers which depend on the agent possessing one
// collectable will block the entire column in which they are positioned.
//
// Parameters:
//  `n_rows`: Number of rows in map. Example: 5.
//  `n_cols`: Number of columns in map. Example: 100.
//  `agent_pos`: Initial row position for the agent. Example: 2. It is inferred
//    that the absolute position will then be (2, 0).
//  `goal_pos`: Row of the final goal. After `ic_limit` instructions,
//    the agent must be at `goal_pos` for a game to be considered succesfully
//    finished. Example: 2. It is inferred that the absolute position will
//    then be (2, `n_cols` - 1).
//  `walkable_fxn`: function to determine which spots will be filled with
//    walkable surfaces. The other spots will be filled with non-walkable
//    surfaces, such as rocks or water. Example:
//      function(row, col) { return (row == 2); }
//    In this example, there will be a trail connecting the horizontal ends of
//    the map. The trail will be on the third row, starting up and following
//    down the map.
//  `collectables`: an object with a mapping from collectables' names to
//    a list of positions where they can be collected, and a list of positions
//    where they should be deposited. Example:
//      { BLUE_KEY: {
//          collect: [ [2, 3], [2, 7], [2, 10] ],
//          deposit: [ 20, 27, 30 ]
//        },
//        YELLOW_KEY: {
//          collect: [ [2, 28], [2, 45], [2, 49] ],
//          deposit: [ 60, 70, 80 ]
//        }
//      }
//    In this example, there will be `BLUE_KEY`s in the following positions:
//    (2, 3), (2, 7), (2, 10). There will be gateway unlockers that are unlocked
//    using `BLUE_KEY`s in columns 20, 27 and 30. The same logic applies to
//    `YELLOW_KEY`s.
//  `agent_conditions`: an object containing items and their lifetime. Example:
//      { BATTERY: 10,
//        MOTOR: 50
//      }
//    In this example, the BATTERY will last for 10 instructions before it needs
//    to be replaced, while the MOTOR will last 50 instructions before it needs
//    to be repaired.
//  `ic_limit`: The maximum number of instructions that the agent has before the
//    game ends without success. Example: 500.
var Lesson04Game = function(n_rows, n_cols, agent_pos, goal_pos, walkable_fxn,
                            collectables, agent_conditions, ic_limit) {
  this.n_rows = n_rows;
  this.n_cols = n_cols;
  this.agent_pos = new Grid.Position(agent_pos, 0);
  this.agent_direction = Grid.Directions.RIGHT;
  this.agent_collected_items = new Array();
  this.goal_pos = new Grid.Position(goal_pos, this.n_cols - 1);
  this.walkable_fxn = walkable_fxn;
  this.collectables = collectables;
  this.agent_conditions = agent_conditions;
  this.ic_limit = ic_limit;

  this.ic_count = 0;

  // Initialize grid with walkable positions and collectables
  function initialize() {
    this.grid = new Grid.Grid(this.n_rows, this.n_cols);
    for (var i = 0; i < this.n_rows; ++i) {
      this.grid[i] = new Array(this.n_cols);
      for (var j = 0; j < this.n_cols; ++j) {
        this.grid.set(i, j,{
          walkable: this.walkable_fxn(i, j),
          collectables: new Array(),
          deposits: new Array(),
        });
      }
    }
    for (var c in this.collectables) {
      for (var pos_idx = 0; pos_idx < this.collectables[c].collect.length;
           ++pos_idx) {
        var pos = this.collectables[c].collect[pos_idx];
        this.grid.get(pos[0], pos[1]).collectables.push(c);
      }
      for (var col_idx = 0; col_idx < this.collectables[c].deposit.length;
           ++col_idx) {
        var col = this.collectables[c].deposit[col_idx];
        for (var row = 0; row < this.n_rows; ++row) {
          this.grid.get(row, col).deposits.push(c);
        }
      }
    }
  }
  initialize.call(this);
};

Lesson04Game.Error = {
  WALKED_INTO_NONWALKABLE: 0,
  AGENT_CONDITION_UNSATISFIED: 1,
  ITEM_NEEDS_DEPOSIT: 2,
};

Lesson04Game.Status = function(error, message) {
  this.error = error;
  this.message = message;
};

Lesson04Game.prototype = {
  // Indicates whether the agent can move forward. It will only be possible
  // if the grid cell in front of the agent is walkable, there are no deposits
  // in front of the agent and there are no agent conditions currently not taken
  // care of.
  // Return value: a tuple whose first element is true if the agent can move
  //               forward and second element is an error message.
  canMoveForward: function() {
    var newPosition = this.agent_pos.add(this.agent_direction);
    if (!this.grid.get(newPosition.row, newPosition.column).walkable)
      return [false, new Lesson04Game.Status(
              Lesson04Game.Error.WALKED_INTO_NONWALKABLE,
              "Cannot walk into non-walkable.")];
    for (var condition in this.agent_conditions) {
      if (this.agent_conditions[condition] == 0)
        return [false, new Lesson04Game.Status(
                Lesson04Game.Error.AGENT_CONDITION_UNSATISFIED,
                "The following agent condition is unmet: " + condition)];
    }
    if (this.grid.get(newPosition.row, newPosition.column)
        .deposits.length != 0) {
      return [false, new Lesson04Game.Status(
              Lesson04Game.Error.ITEM_NEEDS_DEPOSIT,
              "The following item was not deposited: " +
              this.grid.get(newPosition.row, newPosition.column).deposits[0])];
    }
    return [true, null];
  },

  // Makes the agent move forward. WARNING: This command is not checked
  // (canMoveForward should be checked first).
  moveForward: function() {
    this.agent_pos = this.agent_pos.add(this.agent_direction);
    this.ic_count += 1;
    for (var condition in this.agent_conditions) {
      --this.agent_conditions[condition];
    }
  },

  turnRight: function() {
    this.agent_direction = Grid.turnRight(this.agent_direction);
  },

  turnLeft: function() {
    this.agent_direction = Grid.turnLeft(this.agent_direction);
  },

  // To be used internally. Returns true if there is a collectable item named
  // `item` at pos `pos` in the grid. 
  _positionContainsCollectableItem: function (pos, item) {
    return this.grid
      .get(pos.row, pos.column)
      .collectables.findIndex(function(e, i, a) {
        return e == item;
      }) != -1;
  },

  // To be used internally. Returns true if there is a deposit of an item named
  // `item` at pos `pos` in the grid.
  _positionContainsDepositOfItem: function (pos, item) {
    return this.grid
      .get(pos.row, pos.column)
      .deposits.findIndex(function(e, i, a) {
        return e == item;
      }) != -1;
  },

  // Returns true if the agent is standing in front (and staring at) the
  //  deposit of `item`.
  isStandingInFrontOfDeposit: function (item) {
    var front_cell_pos = this.agent_pos.add(this.agent_direction);
    return this._positionContainsDepositOfItem(front_cell_pos, item);
  },

  // Returns true if the agent is standing over some collectable `item`.
  isStandingOverCollectable: function (item) {
    return this._positionContainsCollectableItem(this.agent_pos, item)
  },

  // Collects `item` given agent is standing on top of it. Returns true if
  // the item was collected successfully.
  collectOver: function (item) {
    var collectables = this.grid.get(this.agent_pos.row, this.agent_pos.column)
      .collectables;
    for (var c = collectables.length; c >= 0; --c) {
      if (collectables[c] == item) {
        this.agent_collected_items.push(collectables.splice(c, 1)[0]);
        return true;
      }
    }
    return false;
  },

  // Deposits `item` in a deposit lying in front of the agent, given the agent
  // currently holds a previously collected item of the same type. Returns true
  // if the item was deposited successfully.
  depositFront: function(item) {
    var front_cell_pos = this.agent_pos.add(this.agent_direction);
    var deposits = this.grid.get(front_cell_pos.row, front_cell_pos.column)
      .deposits;
    var indexInGrid = deposits.indexOf(item);
    var indexInAgent = this.agent_collected_items.indexOf(item);
    if (indexInGrid == -1 || indexInAgent == -1)
      return false;

    deposits.splice(indexInGrid, 1);
    this.agent_collected_items.splice(indexInAgent, 1);
    return true;
  }
};

module.exports = Lesson04Game;
