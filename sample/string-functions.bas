10 CHR$ = "A"
11 POKE 2055,4
20 PRINT CHR$;"BLOAD MYDATA"
30 DIM A$(20),B$(20)
40 A$ = "HELLO TO THE WORLD"
50 B$ = A$(1,5): B$(6) = A$(13)
60 TAB 5: PRINT B$
99 END