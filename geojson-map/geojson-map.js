import $ from 'jquery';
import Widget from '../../node_modules/enketo-core/src/js/widget';
import L from 'leaflet';
import config from 'enketo/config';
import {t} from 'enketo/translator';
import events from '../../node_modules/enketo-core/src/js/event';


const DEFAULT_ZOOM = 16;
const DEFAULT_COORD = [47.846982, 1.923605]
const SELECT_COLOR = "red";
const LOAD_GEOJSON_TIMEOUT = 5000;
// Use when call zoomToExtent method.
// If zoom is higher than MAX_ZOOM_EXTENT, zoom to MAX_ZOOM_EXTENT
const MAX_ZOOM_EXTENT = 19;

const DEFAULT_ICON = L.divIcon({
    iconSize: 24,
    className: 'enketo-geopoint-marker'
});

// TODO : Add trans

export default class GeoJsonWidget extends Widget {

    static get selector() {
        return '.or-appearance-geojson-map label:first-child > input';
    }
	
    // For trigger update() methode when list update
    static get list() {
        return true; 
    }
	
	get props() {
        const props = this._props;
        const i = this.question.querySelector( '.option-wrapper label' );
        props.name = i.dataset.itemsPath;
        return props;
    }

    _init() {
        const that = this;
        const img = this.question.querySelector( 'img' );
        this.$form = $( this.element ).closest( 'form.or' );
        this.mapId = Math.round( Math.random() * 10000000 );
		// TODO : Maybe we can do this with other thing than an appearance ?
        this.permanentLabel = this.props.appearances.length && this.props.appearances.includes("geojson-map-permanentlabel");
		this.tooltipDirection = 'top';
		this.tooltipMinZoom = null;
		// TODO Add try catch
		if ( this.props.appearances.length){
			const direction = this.props.appearances.filter(e => e.includes('geojson-map-tooltipdirection'));
			if ( direction && direction.length ){
				this.tooltipDirection = direction[0].split("-").pop();
			}
			const minZoom = this.props.appearances.filter(e => e.includes('geojson-map-tooltipminzoom'));
			if ( minZoom && minZoom.length ){
				this.tooltipMinZoom = parseInt(minZoom[0].split("-").pop());
			}
		}
		
        
		// This is for adding the trigger update() methode when list update
        // maybe we can just use do : this.question.querySelector(".option-wrapper input").classList.add("rank");
        this.question.querySelector(".option-wrapper input[type='radio']") && this.question.querySelector(".option-wrapper input[type='radio']").classList.add("rank");
        this.question.querySelector(".option-wrapper input[type='checkbox']") && this.question.querySelector(".option-wrapper input[type='checkbox']").classList.add("rank");
        
        this.question.classList.add( 'or-geojson-map-initialized' );
		
		if (this.props.name ){
			const instance = this.props.name.split( '/' ).length > 0 ? this.props.name.split( '/' )[0] : null;
			this.instanceName = instance && instance.includes('instance') ? instance.split( "'" )[1] : null;
		}
        
        if ( !img ) {
            this._showGeoJsonError( 'geojsonNotFound' );
        } else if ( img.getAttribute( 'src' ) ) {
            // return a promise, resolving with instance for asynchronous initialization
            return this._addMarkup( img )
                .then( this._addFunctionality.bind( this ) )
                .then( () => this );
        } else {
            
            return new Promise( resolve => {
                // TODO : why img.addEventListener( 'load' doesn't work with my geosjon, and work with svg on image-map ?
                // img.addEventListener( 'load', () => {
                    // that._addMarkup( img )
                    // .then( that._addFunctionality.bind( that ) );
                    // loadingStatus = true;
                    // resolve( that );
                // });
                // So, I load a Observer
                var loadingStatus = false;
                MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
                new MutationObserver(function onSrcChange(){
                    that._addMarkup( img )
                    .then( that._addFunctionality.bind( that ) );
                    loadingStatus = true;
                    resolve( that );
                }).observe(img,{attributes:true,attributeFilter:["src"]})
                // After LOAD_GEOJSON_TIMEOUT milisec, if not load, show an error 
                // Maybe make it better ?
                setTimeout(function() {
                    if(!loadingStatus){
                        that._showGeoJsonError("Cannot load geojson from cache");
                    }
                }, LOAD_GEOJSON_TIMEOUT)
            } ).then( () => this );
            // Ignore errors, because an img element without source may throw one.
            // E.g. in Enketo Express inside a repeat: https://github.com/kobotoolbox/enketo-express/issues/961
        }
    }
    
    /**
     * @param {Element} img - the image element
     * @return {Promise} the widget element
     */
    _addMarkup( img ) {
        const that = this;
        const src = img.getAttribute( 'src' );
        
        /**
         * For translated forms, we now discard everything except the first image,
         * since we're assuming the images will be the same in all languages.
         */
        return fetch( src )
            .then( response => response.json() )
            .then( geojson => {
                if(that._isValidGeojson(geojson)){
                    const divmap = that._createFragment();
                    // originalGeojson was used on update() methode for recalculate the _removeUnmatchedIds
                    that.originalGeojson = JSON.parse(JSON.stringify(geojson));
                    that._removeUnmatchedIds( geojson );
                    that.map = that._createMap(divmap);
                    that.geoJsonLayer = that._createLayer(geojson);
                    if(!that.geoJsonLayer){ throw 'Cannot  init geoJsonLayer'; }
                }
            })
			.catch( (error) => {
				that._showGeoJsonError(error);
			})
    }
    
    /**
     * Create DOM structure
     * @return {HTMLElement} HTML root node
     */
    _createFragment(){
        // TODO : My leaflet-bar have a z-index so high, and the minimal list show under ... 
        const that = this;
        that.question.querySelectorAll( 'img' ).forEach( el => el.remove() );
        // Create DOM structure like of geopicker widget.
        let divwrapper = document.createElement("div"); // wrapper for mbtiles
        divwrapper.classList.add('map-canvas-wrapper');
        const divmap = document.createElement("div");
        divmap.classList.add('map-canvas');
        divmap.id = "geojsonmap-" + that.mapId;
        divwrapper.appendChild(divmap);
        that.question.querySelector( 'fieldset > .option-wrapper' ).before( divwrapper );
        return divmap;
    }
    
    /**
     * Create the leaflet map on the DOM node
     * @param {HTMLElement} The div map
     * @return {object} Leaflet map object
     */
    _createMap( divmap ){
        // create the map
        const newmap = L.map(divmap.id, {
            center: DEFAULT_COORD,
            zoom: DEFAULT_ZOOM
        });
        // TODO : load tile layers like geopicker widget
        L.tileLayer(config.maps[0]["tiles"][0], {
            attribution: config.maps[0]["attribution"],
            maxZoom: 21,
            id: 'streets',
        }).addTo(newmap);
        
        // create the geolocation button
        const geoloc = document.createElement("a");
        geoloc.setAttribute("class", "icon icon-crosshairs");
        geoloc.setAttribute("href", "#");
        geoloc.setAttribute("role", "button");
        geoloc.setAttribute("title", t('geojson-map.geolocation'));
        geoloc.onclick = function () {
            // TODO : I think in the enketo-core we have this function - maybe replace it ?
            // -> import { getCurrentPosition } from '../../js/geolocation';
            navigator.geolocation.getCurrentPosition(function (position) {
                newmap.setView([position.coords.latitude, position.coords.longitude], DEFAULT_ZOOM);
            }, function () {
                console.error("cannot get your current position");
            });
            return false;
        };
        if(!(this.props.appearances && this.props.appearances.includes("geojson-map-zoom-extent"))){
            geoloc.click();
        }
        $(divmap).find(".leaflet-bar")[0].appendChild(geoloc);
        return newmap;
    }
    
    /**
     * Create a geojson layer and added to the map
     * @param {json} A valid geoJSON
     * @return {object} A leaflet layer
     */
    _createLayer( geojson ){
        // TODO : add label of features (based on label properties, or name otherwise) on the map only if geojson-map-label appearance is active
        const that = this;
        if(!that.map){
            throw "Map is not initialized";
        }
        const geojsonLayer = L.geoJSON(geojson["features"], {
            onEachFeature: function (feature, layer) {
                const name = feature["properties"]["name"];
				const label = feature["properties"]["label"];
                if(name){ // enable click action only on feature who has a name match with the list (_removeUnmatchedIds)
                    layer.on('click', function (e) {
                        const input = that._getInput( name );
                        if ( input ) {
                            input.checked = !input.checked;
                            input.dispatchEvent( events.Change() );
                            input.dispatchEvent( events.FakeFocus() );
                        }
                    });
					let tooltip = name;
					if ( label ) {
						tooltip = label;
					}
					
					// const geomType = `geojson-${feature.geometry.type}`
					const classes = `geojson-label geojson-${feature.geometry.type} ${that.instanceName}`
					layer.bindTooltip(tooltip, {permanent: that.permanentLabel, direction:that.tooltipDirection, className: classes})
                }
            },
            pointToLayer: function (feature, latlng) {
                return L.marker(latlng, {
                    icon: DEFAULT_ICON
                    // title: "TODO name"
                });
            }
        }).addTo(that.map);
        // This layer is used when appearance geojson-map-zoom-extend is set (for zoom on)
        that.layerExtend = new L.GeoJSON(geojson["features"], {
            filter: function(feature, layer) {
                return feature.properties.name;
            }
        });
		if ( that.tooltipMinZoom ) {
			that.map.on('zoomend', function() {
			  if (that.map.getZoom() < that.tooltipMinZoom) {
				  that.map.getPane('tooltipPane').style.display = 'none';
			  } else {
				  that.map.getPane('tooltipPane').style.display = 'block';
			  }
			})
		}
        return geojsonLayer;
    }
    
    /**
     * @param {object} widget - the widget element
     */
    _addFunctionality( widget ) {
        // widget param is a copy from image-map - here, is ever null. What is it for in image-map ?
        this._setChangeHandler();
        this._updateLayer();
        this._updateMapOnFilpPage();
        this._zoomToExtend()
    }
    
    /**
     * Handles change listener when you click on feature for example
     */
    _setChangeHandler() {
        this.question.addEventListener( 'change', this._updateLayer.bind( this ) );
    }
    
    /**
     * Like geopicker widget, update map on flip page.
     */
    _updateMapOnFilpPage(){
        const that = this;
        // ensure all tiles are displayed when revealing page, https://github.com/kobotoolbox/enketo-express/issues/188
        // remove handler once it has been used
        this.$form.on( `pageflip.map${this.mapId}`, event => {
            if ( that.map && $.contains( event.target, that.element ) ) {
                that.map.invalidateSize();
                that.$form.off( `pageflip.map${that.mapId}` );
                that._zoomToExtend();
            }
        } );
    }
    
    /**
     * Zoom to the extend of selectable features
     * Only if you add geojson-map-zoom-extend appearance
     */
    _zoomToExtend(){
        if ( this.props.appearances && this.props.appearances.includes("geojson-map-zoom-extent" ) ) {
            if ( this.map && this.geoJsonLayer && this.layerExtend && ! $.isEmptyObject(this.layerExtend.getBounds()) && this.layerExtend.getLayers().length){
                try {
                    this.map.fitBounds( this.layerExtend.getBounds() );
                    if ( this.map.getZoom() > MAX_ZOOM_EXTENT ){
                        this.map.setZoom(MAX_ZOOM_EXTENT);
                    }
                } catch ( error ){
                    console.error("Cannot zoom to extend");
                }
            }else {
                console.error( "Cannot zoom to extend, map or layer doesn't not initialized" );
            }
        }
    }
    
    /**
     * Updates 'selected' attributes in GeoJSON
     * Always update the map after the value has changed in the original input elements
     */
    _updateLayer() {
        const that = this;
        const values = this.originalInputValue;
        that.geoJsonLayer.resetStyle()
        that.geoJsonLayer.eachLayer(function(layer) {
            const currentLayerName = layer.feature.properties.name;
            if (layer instanceof L.Marker){
                layer.getElement().style.color ='blue'; // TODO : I cannot reset the default color
                if ((typeof values === 'string' && currentLayerName == values) || (typeof values !== 'string' && values.includes( currentLayerName )) ){
                    layer.getElement().style.color = SELECT_COLOR;
                }
                if ( !currentLayerName ){
                    layer.getElement().style.color ='grey'; // TODO : 'grey' in a global CONST like the other one ?
                }                
            }else if (layer instanceof L.Polygon){
               if ((typeof values === 'string' && currentLayerName == values) || (typeof values !== 'string' && values.includes( currentLayerName )) ){
                    layer.setStyle({
                        fillColor: SELECT_COLOR,
                        fillOpacity: 0.8,
                        weight: 0.2
                    });
                }
                if ( !currentLayerName ){
                    layer.setStyle({
                        fillColor: 'grey',
                        fillOpacity: 0.4,
                        color: 'grey', // stroke
                        opacity: 0.8, // stroke
                        weight: 0.1
                    });
                }
            }else if (layer instanceof L.Polyline){
               if ((typeof values === 'string' && currentLayerName == values) || (typeof values !== 'string' && values.includes( currentLayerName )) ){
                    layer.setStyle({
                        color: SELECT_COLOR
                    });
                }
                if ( !currentLayerName ){
                    layer.setStyle({
                        color: 'grey'
                    });
                }else{
                    
                }
            }else{
                console.error("Feature type not supported");
            }
			// TODO : https://gis.stackexchange.com/questions/22474/geojson-styling-information
            // We can set style from geojson style propertie ? especially for feature who don't have a currentLayerName
            // So, we can override style of somes features directly in the geojson
			// if ( layer.feature.style...){
				// layer.setStyle(layer.feature.style);
			// }
        })
    }
    
    /**
     * Test is GeoJSON is valid
     *
     * @param {object} data - an json
     * @return {boolean} whether provided object is a valid GeoJson
     */
    _isValidGeojson( data ){
        if(!data.hasOwnProperty('features')){console.error("no features key in geojson");return false};
        if(!Array.isArray(data['features'])){console.error("features is not an array");return false};
        if(!data['features'].length){console.error("features array is empty");return false};
        // TODO : test foreach feature the type, properties and geometrie ?
        return true;
    }
    
    /**
     * Removes name attributes from unmatched feature in order to prevent hover effect (and click listener).
     *
     * @param {Element} json - features array
     */
    _removeUnmatchedIds( features ) {
        // TODO : Remove duplicate name in geosjon ?
        features["features"].forEach( (feature, index, object) => {
            if ( !this._getInput( feature["properties"]["name"] ) ) {
                delete feature["properties"]["name"];
            }
        });
    }
    
    /**
     * @param {string} id - the option ID
     * @return {Element} input element with matching ID
     */
    _getInput( id ) {
        return this.question.querySelector( `input[value="${CSS.escape( id )}"]` );
    }
    
    /**
     * @param {Error} err - error message
     */
    _showGeoJsonError( err ) {
        console.error( err );
        const fragment = document.createRange().createContextualFragment(
            `<div class="widget geojson-map">
                <div class="geojson-map__error" data-i18n="geojsonmap.geojsonNotFound">${err}</div>
            </div>`
        );
        this.question.querySelector( '.option-wrapper' ).before( fragment );
		this.question.querySelector( '.option-wrapper' ).style.display = 'block';
    }
    
    update() {
        const that = this;
        if ( that.map ){
            that.map.removeLayer(that.geoJsonLayer);
            that.geoJsonLayer = null;
            const geojson = JSON.parse(JSON.stringify(that.originalGeojson));
            that._removeUnmatchedIds( geojson );
            that.geoJsonLayer = that._createLayer(geojson);
            that._updateLayer();
            that._zoomToExtend()
        }
    }
    get value() {
        // This widget is unusual. It would better to get the value from the map.
        return this.originalInputValue;
    }
    
    set value( value ) {
        // This widget is unusual. It would more consistent to set the value in the map perhaps.
        this.originalInputValue = value;
    }
    
    disable() {
        // TODO what ? Same of geopicker ?
    }

    /**
     * Enables widget
     */
    enable() {
        this.map.invalidateSize();
		this._zoomToExtend()
		//TODO : Need a full upate() ?
    }
}

