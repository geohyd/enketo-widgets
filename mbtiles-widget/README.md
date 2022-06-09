Mbtiles Enketo Widget 1.0.0
==========

To add this widget to your Enketo Express installation see [this guidance](https://github.com/kobotoolbox/enketo-express/blob/master/tutorials/34-custom-widgets.md).

Works on all regular "geo*" questions with the `"mbtiles"` appearance.  
An example is available in `xlsform_mbtiles_example.xlsx` XLSForm.

This widget allow to add a mbtiles files on a geo* question.  
Mbtiles files are stored in the indexedDB for the offline mode.  
And the mbtile is automaticly load when you refresh the page.

## TODO : 
The script `sql.js` is loading through scriptjs, so a connection is needed ...
We must change this (find a sql import ?)