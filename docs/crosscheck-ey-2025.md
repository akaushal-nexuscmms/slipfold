# Cross-check against EY's 2025 personal tax calculator

Run 2026-09-09 with `py scripts/ey-scrape.py` + `node scripts/crosscheck.ts`. EY's calculator applies only the basic personal amount, so the engine was run with CPP/EI at zero, the Canada employment amount added back, and the Ontario health premium removed. Every difference of 0.00 confirms that jurisdiction's bracket table and BPA (with phase-out) at that income. The three non-zero cells are the provincial low-income tax reductions the app does not yet model (flagged in-app); Quebec's provincial return is out of scope.

```
income   prov   engine      EY          diff      note
30000    AB        2625.46     2625.00       0.46  
30000    BC        2874.94     2490.00     384.94  CHECK
30000    MB        3547.06     3547.00       0.06  
30000    NB        3572.08     3013.00     559.08  CHECK
30000    NL        3658.47     3633.00      25.47  CHECK
30000    NT        2728.62     2728.00       0.62  
30000    NS        3616.00     3616.00       0.00  
30000    NU        2440.34     2440.00       0.34  
30000    ON        2882.58     2882.00       0.58  
30000    PE        3469.55     3470.00      -0.45  
30000    QC        2011.30     3280.00   -1268.70  QC provincial not modelled
30000    SK        3114.75     3114.00       0.75  
30000    YT        2899.04     2899.00       0.04  
60000    AB        9532.96     9533.00      -0.04  
60000    BC        9183.47     9183.00       0.47  
60000    MB       11548.06    11547.00       1.06  
60000    NB       11299.50    11299.00       0.50  
60000    NL       11692.83    11692.00       0.83  
60000    NT        9223.09     9223.00       0.09  
60000    NS       12577.27    12577.00       0.27  
60000    NU        8306.63     8307.00      -0.37  
60000    ON        9196.75     9196.00       0.75  
60000    PE       11885.93    11885.00       0.93  
60000    QC        6518.80    11581.00   -5062.20  QC provincial not modelled
60000    SK       10902.98    10903.00      -0.02  
60000    YT        9394.79     9394.00       0.79  
90000    AB       18682.95    18683.00      -0.05  
90000    BC       17643.46    17643.00       0.46  
90000    MB       21523.06    21522.00       1.06  
90000    NB       21649.50    21649.00       0.50  
90000    NL       22213.87    22214.00      -0.13  
90000    NT       17953.09    17953.00       0.09  
90000    NS       23710.81    23710.00       0.81  
90000    NU       16556.63    16557.00      -0.37  
90000    ON       18091.75    18091.00       0.75  
90000    PE       22870.20    22870.00       0.20  
90000    QC       12668.80    22417.00   -9748.20  QC provincial not modelled
90000    SK       20802.98    20803.00      -0.02  
90000    YT       18244.78    18244.00       0.78  
150000   AB       38921.71    38922.00      -0.29  
150000   BC       38905.50    38905.00       0.50  
150000   MB       45736.80    45736.00       0.80  
150000   NB       45235.97    45236.00      -0.03  
150000   NL       45932.62    45932.00       0.62  
150000   NT       39010.35    39010.00       0.35  
150000   NS       48400.73    48400.00       0.73  
150000   NU       35807.12    35807.00       0.12  
150000   ON       41545.96    41545.00       0.96  
150000   PE       47665.95    47666.00      -0.05  
150000   QC       26907.55    48240.00  -21332.45  QC provincial not modelled
150000   SK       42541.74    42541.00       0.74  
150000   YT       38553.28    38553.00       0.28  
300000   AB      103420.15   103420.00       0.15  
300000   BC      109587.09   109587.00       0.09  
300000   MB      117446.61   117446.00       0.61  
300000   NB      117841.55   117841.00       0.55  
300000   NL      118994.12   118993.00       1.12  
300000   NT      104492.14   104491.00       1.14  
300000   NS      124495.65   124499.00      -3.35  
300000   NU       97117.78    97117.00       0.78  
300000   ON      116006.03   116006.00       0.03  
300000   PE      120923.62   120923.00       0.62  
300000   QC       71665.22   124240.00  -52574.78  QC provincial not modelled
300000   SK      108994.42   108994.00       0.42  
300000   YT      102083.03   102083.00       0.03  

worst absolute difference outside Quebec: $559.08
```
