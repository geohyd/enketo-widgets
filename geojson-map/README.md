# geojson-map Widget

This widget is based on excellent image-map, and geopicker widgets  
This widget show a leaflet map instead a regular select_one/multiple question.  
It draw a map with a geoJSON (instead of a SVG) and we can select option with the geojson feature's  
The geoJSON file is set on the image XLSForm column - like image-map.  
In this Example, my geoJSON have .json extension, but you can change with .csv (also in XLSForm).

## How it work

Add a geojson reference file in image column of the XLSForm and the geojson-map appearance.

# Use .json extension 

For used the .json extension, we need to update :
## in KPI : 
- kpi/models/asset_file.py  
Add mimetype : 
`
'application/json',
`

## In Kobocat
- in the settings base.py  
add to SUPPORTED_MEDIA_UPLOAD_TYPES :
'application/json'


# Translation
Need to be set.

# Demo

In the example folder, you have a XLSForm and a geojson file for test.  
Import the XLSForm, import the geojson.json file in media and publish.

# TODO

There is still a lot of TODO ...  
Show in code.