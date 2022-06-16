/**
*(c) Anteagroup 
*anteagroup.fr
*/
import $ from 'jquery';
import Widget from '../../node_modules/enketo-core/src/js/widget';
import { t } from 'enketo/translator';
import L from 'leaflet';


const DEFAULT_COLOR = "green";
// Use when call zoomToExtent method.
// If zoom is higher than MAX_ZOOM_EXTENT, zoom to MAX_ZOOM_EXTENT
const MAX_ZOOM_EXTENT = 19;

const DEFAULT_ICON = L.divIcon({
    iconSize: 24,
    className: 'enketo-geopoint-marker'
});

L.Map.addInitHook(function () {
  this.getContainer()._leaflet_map = this;
});

// Based on https://enketo.github.io/enketo-core/tutorial-40-widgets.html
export default class GeoLayer extends Widget {

	static get selector() {
        return '.question.or-appearance-geo-layer input[data-type-xml="geopoint"]:not([data-setgeopoint]), .question.or-appearance-geo-layer input[data-type-xml="geotrace"], .question.or-appearance-geo-layer input[data-type-xml="geoshape"]';
    }

	_init() {
		const that = this;
        const img = this.question.querySelector( 'img' );
		this.permanentLabel = this.props.appearances.length && this.props.appearances.includes("geo-layer-permanentlabel");
		this.tooltipDirection = 'top';
		if ( !img ) {
            this._showGeoJsonError( 'geojsonNotFound' );
        } else if ( img.getAttribute( 'src' ) ) {
            // This sleep is needed for waiting the initialization of geomap. can be make a different solution ?
			this.sleep(2000).then(()=>{
            return this._addMarkup( img )
				.then( this._addFunctionality.bind( this ) )
                .then( () => this );
			});
        } else {
			console.error("Offline mode not implemented");
		}
    }

	sleep(ms) {
	  return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
     * Zoom to the extend of selectable features
     * Only if you add geojson-map-zoom-extend appearance
     */
    _zoomToExtend(){
        if ( this.props.appearances && this.props.appearances.includes("geo-layer-zoom-extent" ) ) {
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
     * @param {Element} img - the image element
     * @return {Promise} the widget element
     */
    _addMarkup( img ) {
        const that = this;
        const src = img.getAttribute( 'src' );
		that.question.querySelectorAll( 'img' ).forEach( el => el.remove() );
        /**
         * For translated forms, we now discard everything except the first image,
         * since we're assuming the images will be the same in all languages.
         */
        return fetch( src )
            .then( response => response.json() )
            .then( geojson => {
                if(that._isValidGeojson(geojson)){
					that.map = this.question.querySelector( '.map-canvas-wrapper .map-canvas' )._leaflet_map;
                    that.geoJsonLayer = that._createLayer(geojson);
                }
            })
			.catch( (error) => {
				that._showGeoJsonError(error);
			})
    }

	/**
     * @param {object} widget - the widget element
     */
    _addFunctionality( widget ) {
        // widget param is a copy from image-map - here, is ever null. What is it for in image-map ?
		const that = this;
        that._zoomToExtend();
		that.geoJsonLayer.eachLayer(function(layer) {
			if (layer instanceof L.Marker){
				layer.getElement().style.color =DEFAULT_COLOR;          
			}
		});
		that.geoJsonLayer.off('click');
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
					let tooltip = name;
					if ( label ) {
						tooltip = label;
					}
					const classes = `geojson-label geojson-${feature.geometry.type} ${that.instanceName}`
					layer.bindTooltip(tooltip, {permanent: that.permanentLabel, direction:that.tooltipDirection, className: classes})
					
                }
            },
            pointToLayer: function (feature, latlng) {
                return L.marker(latlng, {
                    icon: DEFAULT_ICON,
					clickable: false // todo not work ?
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
     * @param {Error} err - error message
     */
    _showGeoJsonError( err ) {
        console.error( err );
        const fragment = document.createRange().createContextualFragment(
            `<div class="widget geojson-map">
                <div class="geojson-map__error" data-i18n="geojsonmap.geojsonNotFound">${err}</div>
            </div>`
        );
        this.question.querySelector( '.geopicker.widget' ).before( fragment );
		this.question.querySelector( '.geopicker.widget' ).style.display = 'block';
    }
	 
	 
    /*
     * If you want overrides some Widget methods
    disable() {
        //this.disabled = true;
    }
	
    enable() {
        //this.disabled = false;
    }
	
    update() {
        //this.value = this.originalInputValue;
    }
	
    get value() {
        //return this.element.classList.contains( 'empty' ) ? '' : this.value;
    }
	
    set value( value ) {
        //this.value = value;
    }
	*/
}