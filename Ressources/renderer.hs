double :: Int -> Double
double = fromIntegral

vbar :: Int -> Diagram B
vbar n = vrule (double n) # alignT

hbar :: Int -> Diagram B
hbar n = hrule (double n) # alignL

draw :: Term -> Diagram B
draw t = let (fig, _, _) = draw' t in fig # lwL 0.5 # frame 1
 where
  draw' :: Term -> (Diagram B, Int, Int)
  draw' (Lam t) = (binder <> (fig # translateY (-1)), h + 1, w)
   where
    (fig, h, w) = draw' t
    binder      = hrule (double (2 * w) - 0.5) # alignL # translateX (-0.75)

  draw' (Var i) = (fig, 0, 1)
   where
    fig = (phantom (hrule 2 :: Diagram B) <> vrule (double $ i + 1)) # alignB

  draw' (App t1 t2) =
    (((fig1 <> tail1) ||| (fig2 <> tail2)) <> bar, h1 + delta1 + 1, w1 + w2)
   where
    (fig1, h1, w1) = draw' t1
    (fig2, h2, w2) = draw' t2
    delta1         = max 0 (h2 - h1)
    delta2         = max 0 (h1 - h2)
    tail1          = vbar (delta1 + 1) # translateY (double (-h1))
    tail2          = vbar delta2 # translateY (double (-h2))
    bar            = hbar (2 * w1) # translateY (double (-h1 - delta1)) # lineCap LineCapSquare
