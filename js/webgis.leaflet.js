L.TileLayer.WebGis = L.TileLayer.extend({

	initialize: function (url, options) {
		L.TileLayer.prototype.initialize.call(this, url, options);
		options.userId = options.userId || 0;
		options.nocache = options.nocache || false;
		this._url = url + '/gis_render/{x}_{y}_{z}/' + options.userId + '/tile.png';
		if (options.nocache) {
			this._url += '?t='+ new Date().getTime();
		}
		// add session id
		if (options.sessionId) {
			this._url += (this._url.indexOf('?') == -1 ? '?' : '&') + 'sid=' + options.sessionId;
		}
	},

	getTileUrl: function (tilePoint) {
		return L.Util.template(this._url, L.extend({
			//https://github.com/Leaflet/Leaflet/pull/2296
			r: this.options.detectRetina && L.Browser.retina && this.options.maxZoom > 0 ? '@2x' : '',
			s: this._getSubdomain(tilePoint),
			z: 17 - this._getZoomForUrl(),
			x: tilePoint.x,
			y: tilePoint.y
		}, this.options));
	}
});

L.tileLayer.webGis = function (url, options) {
	return new L.TileLayer.WebGis(url, options);
};