/*
 * Starts a lesson in a given component.
 */

var React = require("react");
var ReactDOM = require("react-dom");
var DummyLesson = require("./lesson/dummy_lesson");
var LessonEnvironment = require("./view/lesson_environment");

var startLesson = function(lessonClass, domElement) {
  ReactDOM.render(<LessonEnvironment lesson={new lessonClass()} />,
                  domElement);
};

module.exports = {
  startLesson: startLesson,
  DummyLesson: DummyLesson,
};
