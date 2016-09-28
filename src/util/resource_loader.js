/*
 * Module that loads a list of resources (e.g. images) to a local store and
 * then calls back after all of them have finished loading.
 */

function ResourceLoader() {
  this._images = [];
}

ResourceLoader.prototype = {
  /// Adds a resource to be loaded.
  addImage: function(url) {
    this._images.push(url);
  },
  /// Loads the registered resources and calls onLoad when all of them have
  /// finished loading.
  load: function(onLoad) {
    var loaded_images = new Array();
    loaded_images.length = this._images.length;
    loaded_images.fill(false);

    var done = function() {
      return loaded_images.indexOf(false) == -1;
    };

    this._loaded_resources = {};
    var loaded_resources = this._loaded_resources;
    function createCallback(loaded_images, index, done, url, image, onLoad) {
      return function() {
        loaded_resources[url] = image;
        loaded_images[index] = true;
        if (done()) {
          onLoad();
        }
      };
    }

    for (var i = 0; i < this._images.length; i++) {
      var image = new Image();
      var index = new Number(i);
      var url = this._images[i];

      image.onload = createCallback(loaded_images, new Number(i), done,
                                    url, image, onLoad);

      image.onerror = function(error) {
        console.error("Error when loading " + url + ": " + error);
      }

      image.src = url;
    }

    // If all images were already in the browser's cache, img.onload may never
    // be called. Otherwise, it (or onerror) will be called at least once.
    if (done()) {
      onLoad();
    }
  },

  /// Returns the resource loaded from the given URL.
  get: function(url) {
    if (!this._loaded_resources.hasOwnProperty(url)) {
      throw "Resource not loaded: " + url;
    }
    return this._loaded_resources[url];
  },
};

module.exports = new ResourceLoader();
