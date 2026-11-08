"""Run only against a disposable Development API. Python standard library only.
Set DAFTAR_TEST_ADMIN_EMAIL and DAFTAR_TEST_ADMIN_PASSWORD; creates persistent test data.
OTP:ExposeDevelopmentCode must be true. Never use a production database.
"""
import argparse,datetime,json,os,secrets,time,uuid,urllib.request,urllib.error,http.cookiejar
from zoneinfo import ZoneInfo
p=argparse.ArgumentParser();p.add_argument('--base-url',required=True);args=p.parse_args();BASE=args.base_url.rstrip('/')+'/api/v1'
today=datetime.datetime.now(ZoneInfo('Asia/Hebron')).date()
def key():return str(uuid.uuid4())
def phone():return '059'+''.join(str(secrets.randbelow(10)) for _ in range(7))
class Client:
 def __init__(self):self.http=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));self.token=None
 def call(self,path,method='GET',body=None,expected=200,command=None,csrf=True,auth_retry=0):
  headers={'Accept':'application/json'}
  if self.token and csrf:headers['X-CSRF-TOKEN']=self.token
  if method!='GET':headers['Idempotency-Key']=command or key()
  data=None if body is None else json.dumps(body).encode()
  if data is not None:headers['Content-Type']='application/json'
  try:
   with self.http.open(urllib.request.Request(BASE+path,data=data,headers=headers,method=method),timeout=30) as response:status=response.status;raw=response.read()
  except urllib.error.HTTPError as e:status=e.code;raw=e.read()
  if status==429 and expected==200 and path in ['/auth/otp','/auth/verify','/auth/admin-login'] and auth_retry<2:
   print('Authentication rate limit respected; waiting for the next test window.',flush=True)
   time.sleep(31)
   return self.call(path,method,body,expected,command,csrf,auth_retry+1)
  result=json.loads(raw) if raw else None
  assert status==expected,(method,path,status,result)
  return result
 def csrf(self):self.token=self.call('/auth/csrf')['token']
 def owner(self,num,expected=200):
  self.csrf();challenge=self.call('/auth/otp','POST',{'phone':num});assert challenge.get('developmentCode'),'Development OTP not enabled'
  result=self.call('/auth/verify','POST',{'challengeId':challenge['challengeId'],'code':challenge['developmentCode'],'deviceName':'Integration test'},expected=expected)
  if expected==200:self.csrf()
  return result
admin=Client();admin.csrf();email=os.environ['DAFTAR_TEST_ADMIN_EMAIL'];password=os.environ['DAFTAR_TEST_ADMIN_PASSWORD']
admin.call('/auth/admin-login','POST',{'email':email,'password':password});admin.csrf()
plan=admin.call('/admin/plans')['items'][0]['id']
def make_shop(name):
 num=phone();shop=admin.call('/admin/shops','POST',{'name':name,'owner':'Return test','phone':num,'planId':plan,'expiresOn':str(today+datetime.timedelta(days=30))});c=Client();c.owner(num);return c,shop
c,shop=make_shop('Returns test');other,_=make_shop('Other tenant')
def product(name,price,qty=10,cost=50,unit='قطعة',factor=1):
 p=c.call('/products','POST',{'name':name,'barcode':key(),'category':'test','unit':unit,'salePriceCents':price,'minimum':0,'cartonSize':factor})
 if qty:c.call('/stock/openings','POST',{'productId':p['id'],'quantity':qty,'unitCostCents':cost,'reason':'Test opening'})
 return p
customer=c.call('/customers','POST',{'name':'Return customer','phone':''});supplier=c.call('/suppliers','POST',{'name':'Return supplier','phone':''})
def stock(p):return next(x for x in c.call('/products?status=all&pageSize=100')['items'] if x['id']==p['id'])['stock']
def balance():return c.call('/cash/summary')['balanceCents']
def sale(lines,method='cash',received=None,discount=0,party=None):
 total=sum(int(q*p['salePriceCents']+0.5) for p,q in lines)-discount
 return c.call('/sales','POST',{'customerId':party,'lines':[{'productId':p['id'],'quantity':q,'unitPriceCents':p['salePriceCents']} for p,q in lines],'discountCents':discount,'method':method,'receivedCents':total if received is None else received})
def path(inv):return '/'+('sales' if inv['kind']=='sale' else 'purchases')+'/'+inv['id']+'/returns'
def summary(inv,client=c):return client.call(path(inv))
def returned(inv,lines,method='cash',expected=200,client=c,body=None,command=None):
 data=body or {'lines':[{'productId':p['id'],'quantity':q} for p,q in lines],'refundMethod':method,'reason':'Integration return','revision':summary(inv,client)['revision']}
 return client.call(path(inv),'POST',data,expected=expected,command=command)
def purchase(p,qty,cost,paid=0,discount=0,factor=1):
 return c.call('/purchases','POST',{'supplierId':supplier['id'],'date':str(today),'lines':[{'productId':p['id'],'quantity':qty,'factor':factor,'unitCostCents':cost}],'discountCents':discount,'paidCents':paid,'notes':''})
a=product('A',101,cost=50);b=product('B',202,cost=80)
inv=sale([(a,3),(b,1)],'partial',150,5,customer['id']);assert inv['totalCents']==500 and balance()==150
r1=returned(inv,[(a,1)]);assert (r1['totalCents'],r1['debtReductionCents'],r1['cashCents'],r1['costCents'])==(100,100,0,50);assert stock(a)==8 and balance()==150
body={'lines':[{'productId':a['id'],'quantity':2},{'productId':b['id'],'quantity':1}],'refundMethod':'cash','reason':'Return remaining','revision':summary(inv)['revision']};command=key()
r2=returned(inv,[],body=body,command=command);assert (r2['totalCents'],r2['debtReductionCents'],r2['cashCents'])==(400,250,150)
assert returned(inv,[],body=body,command=command)['id']==r2['id'];assert stock(a)==10 and stock(b)==10 and balance()==0
assert summary(inv)['remainingCents']==0 and len(summary(inv)['items'])==2
assert c.call('/customers/'+customer['id']+'/statement')['balanceCents']==0
assert c.call('/sales/'+inv['id'])['outstandingCents']==350,'Original snapshot must remain unchanged'
report=c.call('/reports/summary');assert report['salesCents']==0 and report['saleReturnsCents']==500 and report['recordedCostOfGoodsCents']==0 and report['grossProfitCents']==0,report
assert c.call('/reports/daily-sales')['items'][0]['totalCents']==0
returned(inv,[(a,1)],expected=409);assert stock(a)==10 and balance()==0
print('PASS partial/full sale return, discount allocation, debt-first/cash split, stock/cost, reports, immutable invoice and idempotency',flush=True)
# Rounding must never over-refund across multiple fractional returns.
w=product('Weighted',1,qty=2,cost=1,unit='كغم');wi=sale([(w,1)])
x=returned(wi,[(w,0.5)]);y=returned(wi,[(w,0.5)]);assert x['totalCents']==1 and y['totalCents']==0 and x['costCents']+y['costCents']==1
assert summary(wi)['remainingCents']==0 and stock(w)==2
free=product('Free',10);fi=sale([(free,1)],discount=10);fr=returned(fi,[(free,1)]);assert fr['totalCents']==0 and stock(free)==10
print('PASS fractional cumulative rounding and fully discounted zero-value returns',flush=True)
# A stale preview or malformed quantity cannot mutate ledgers.
fresh=sale([(a,1)]);old=summary(fresh);c.call('/customers','POST',{'name':'Revision change','phone':''})
stale={'lines':[{'productId':a['id'],'quantity':1}],'refundMethod':'cash','reason':'Stale test','revision':old['revision']}
returned(fresh,[],body=stale,expected=409)
for qty in [0,-1,2,0.5]:returned(fresh,[(a,qty)],expected=409 if qty==2 else 400)
duplicate={'lines':[{'productId':a['id'],'quantity':1}]*2,'refundMethod':'cash','reason':'Duplicate','revision':summary(fresh)['revision']}
returned(fresh,[],body=duplicate,expected=400);assert summary(fresh)['items']==[]
other.call(path(fresh),expected=404);other.call(path(fresh),'POST',dict(stale,revision='0'),expected=404)
# Prices and archive flags can change without changing the original refund price.
current=next(p for p in c.call('/products?status=all')['items'] if p['id']==a['id'])
c.call('/products/'+a['id'],'PATCH',{'salePriceCents':999,'archived':True,'version':current['version']})
assert returned(fresh,[(a,1)])['totalCents']==101
print('PASS stale preview, invalid/duplicate/over-return quantities, tenant isolation and archived original-price refunds',flush=True)
# Card refunds are recorded externally and never alter cash.
cardp=product('Card product',100);ci=sale([(cardp,2)],method='card');before=balance();cr=returned(ci,[(cardp,2)],method='card');assert cr['cardCents']==200 and cr['cashCents']==0 and balance()==before
# Debt already settled after a credit sale must be refunded, not reduced twice.
credit=sale([(cardp,1)],method='credit',received=0,party=customer['id']);c.call('/customers/'+customer['id']+'/payments','POST',{'amountCents':100});before=balance();credit_return=returned(credit,[(cardp,1)]);assert credit_return['debtReductionCents']==0 and credit_return['cashCents']==100 and balance()==before-100
print('PASS card refund cash isolation and paid-credit-invoice refund',flush=True)
# Original carton factor and allocated net cost are preserved across multiple returns.
carton=product('Carton',150,qty=0,factor=12);pi=purchase(carton,2,1200,discount=1,factor=12)
assert stock(carton)==24
pr1=returned(pi,[(carton,1)]);pr2=returned(pi,[(carton,1)])
assert pr1['costCents']+pr2['costCents']==2399
assert pr1['totalCents']+pr2['totalCents']==2399 and pr1['debtReductionCents']+pr2['debtReductionCents']==2399 and stock(carton)==0
assert summary(pi)['remainingCents']==0
paidp=product('Paid purchase',200,qty=0);paid=purchase(paidp,2,100,paid=200);before=balance();refund=returned(paid,[(paidp,1)]);assert refund['cashCents']==100 and balance()==before+100 and stock(paidp)==1
short=product('Insufficient return stock',100,qty=0);shortpi=purchase(short,1,50,paid=50);sale([(short,1)]);before=balance();returned(shortpi,[(short,1)],expected=409);assert balance()==before and not summary(shortpi)['items']
print('PASS partial/full carton purchase returns, discount remainder, supplier cash refund and stock shortage rollback',flush=True)
# Cost is reversed at current moving average for purchase returns; variance is explicit in operating profit.
variance=product('Variance',200,qty=0);v1=purchase(variance,1,100,paid=100);purchase(variance,1,300,paid=300)
vr=returned(v1,[(variance,1)]);assert vr['totalCents']==100 and vr['costCents']==200
report=c.call('/reports/summary');assert report['purchaseReturnVarianceCents']==-100,report
print('PASS purchase-return moving-average valuation and explicit price variance',flush=True)
# A failure on a later return line rolls the first stock movement back too.
ra=product('Atomic A',100);rb=product('Atomic B',100);atomic=sale([(ra,1),(rb,1)]);before=balance();start_a=stock(ra);start_b=stock(rb)
returned(atomic,[(ra,1),(rb,2)],expected=409)
assert stock(ra)==start_a and stock(rb)==start_b and balance()==before and summary(atomic)['items']==[]
invalid={'lines':[{'productId':ra['id'],'quantity':1}],'refundMethod':'wire','reason':'Invalid method','revision':summary(atomic)['revision']}
returned(atomic,[],body=invalid,expected=400)
unknown=product('Unknown cost return',100,qty=0);unknown_invoice=sale([(unknown,1)]);unknown_return=returned(unknown_invoice,[(unknown,1)])
assert unknown_return['costComplete'] is False and c.call('/reports/summary')['grossProfitCents'] is None
print('PASS multi-line transaction rollback, invalid refund method and unknown-cost profit safeguards',flush=True)
# Employee permissions and cost redaction.
num=phone();employee=c.call('/employees','POST',{'name':'Return cashier','phone':num,'email':'','role':'Cashier'});cashier=Client();cashier.owner(num)
assert summary(ci,cashier)['items'][0]['costCents'] is None
assert summary(ci,cashier)['items'][0]['lines'][0]['costCents'] is None
cashier.call(path(pi),expected=403);cashier.call(path(pi),'POST',stale,expected=403)
for d in c.call('/devices')['items']:
 if d['userId']==employee['id'] and d['active']:c.call('/devices/'+d['id']+'/revoke','POST',{})
num=phone();c.call('/employees','POST',{'name':'Return warehouse','phone':num,'email':'','role':'Warehouse'});warehouse=Client();warehouse.owner(num)
warehouse.call(path(ci),expected=403);warehouse.call(path(ci),'POST',stale,expected=403);summary(pi,warehouse)
print('PASS cashier cost redaction and cashier/warehouse return permissions',flush=True)
print('ALL RETURN TESTS PASSED',flush=True)
