import unittest
from acceptance_compare import compare

class ComparisonTests(unittest.TestCase):
 def test_new_flat_is_not_invented_in_baseline(self):
  old=[{'flat':'avani','tier':2,'key':'paint','pass':False,'seconds':10,'tokens':20}]
  new=[{'flat':'avani','tier':2,'key':'paint','pass':True,'seconds':5,'tokens':10}, {'flat':'m6','tier':2,'key':'paint','pass':True,'seconds':4,'tokens':8}]
  rows=compare(old,new)
  avani=next(r for r in rows if r['flat']=='avani');balcony=next(r for r in rows if r['flat']=='m6')
  self.assertEqual(avani['before']['passed'],0);self.assertEqual(avani['after']['passed'],1)
  self.assertIsNone(balcony['before']);self.assertEqual(balcony['after']['total'],1)
 def test_unknowns_and_failed_rows_stay_visible(self):
  rows=compare([], [{'flat':'a','tier':1,'key':'living','pass':False,'seconds':None,'tokens':None},{'flat':'a','tier':1,'key':'living','pass':True,'seconds':4,'tokens':0}])
  now=rows[0]['after'];self.assertEqual((now['passed'],now['total']),(1,2));self.assertEqual(now['seconds_unknown'],1);self.assertEqual(now['tokens_unknown'],1);self.assertEqual(now['tokens_median'],0)
if __name__=='__main__':unittest.main()
