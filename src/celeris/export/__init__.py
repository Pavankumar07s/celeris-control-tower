"""Export: the dashboard data bundle (architecture: ``dashboard/public/data``, written by ``celeris export``).

The bundle is compact, deterministic JSON derived only from pipeline outputs: columnar arrays, dictionary-encoded
labels and one file per view family so the web app loads only what a view needs. ``stage.run_export`` writes it;
``sources`` decides, file by file, whether the real modelling outputs or the dev-only provisional stand-ins are used.
"""
