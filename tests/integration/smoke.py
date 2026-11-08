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
admin=Client();admin.csrf();email=os.environ.get('DAFTAR_TEST_ADMIN_EMAIL');password=os.environ.get('DAFTAR_TEST_ADMIN_PASSWORD');assert email and password,'Set test admin credentials in the environment.'
admin.call('/auth/admin-login','POST',{'email':email,'password':password,'deviceName':'Admin test'});admin.csrf();plan=admin.call('/admin/plans')['items'][0]['id']
def shop(name,num,expiry=None):return admin.call('/admin/shops','POST',{'name':name,'owner':'Test owner','phone':num,'planId':plan,'expiresOn':str(expiry or today+datetime.timedelta(days=30))})
pa,pb=phone(),phone();sa=shop('Integration A',pa);sb=shop('Integration B',pb);a,b=Client(),Client();a.owner(pa);b.owner(pb)
anonymous=Client();anonymous.call('/products',expected=401);a.call('/admin/shops',expected=403)
product=a.call('/products','POST',{'name':'Test oil','barcode':key(),'category':'food','unit':'عبوة','salePriceCents':1400,'minimum':6,'cartonSize':12})
supplier=a.call('/suppliers','POST',{'name':'Test supplier','phone':''});customer=a.call('/customers','POST',{'name':'Test customer','phone':''})
purchase=a.call('/purchases','POST',{'supplierId':supplier['id'],'date':str(today),'lines':[{'productId':product['id'],'quantity':2,'factor':12,'unitCostCents':12000}],'discountCents':0,'paidCents':10000,'notes':''});assert purchase['totalCents']==24000
stock=lambda:a.call('/products?status=all')['items'][0]['stock'];assert stock()==24
body={'customerId':customer['id'],'lines':[{'productId':product['id'],'quantity':2,'unitPriceCents':1400}],'discountCents':0,'method':'partial','receivedCents':1000}
sk=key();sale=a.call('/sales','POST',body,command=sk);replay=a.call('/sales','POST',body,command=sk);assert sale['id']==replay['id'] and stock()==22;assert sale['totalCents']==2800 and sale['outstandingCents']==1800
a.call('/sales','POST',dict(body,receivedCents=900),expected=409,command=sk);assert a.call('/sales')['total']==1
assert a.call('/customers/'+customer['id']+'/payments','POST',{'amountCents':500})['balanceCents']==1300
a.call('/customers/'+customer['id']+'/payments','POST',{'amountCents':1400},expected=409)
a.call('/suppliers/'+supplier['id']+'/payments','POST',{'amountCents':2000});a.call('/suppliers/'+supplier['id']+'/payments','POST',{'amountCents':13000},expected=409)
expense=a.call('/expenses','POST',{'description':'Test electricity','category':'electricity','amountCents':1000,'date':str(today)});a.call('/expenses/'+expense['id']+'/cancel','POST',{'reason':'Test cancellation'})
a.call('/cash/entries','POST',{'direction':'in','amountCents':20000,'description':'Test opening deposit'})
summary=a.call('/cash/summary');assert summary['balanceCents']==9500,summary
check=a.call('/cash/reconciliations','POST',{'actualCents':9000,'revision':summary['revision'],'note':'Test difference'});assert check['differenceCents']==-500 and a.call('/cash/summary')['balanceCents']==9500
a.call('/cash/reconciliations','POST',{'actualCents':9500,'revision':summary['revision'],'note':''},expected=409)
a.call('/stock/adjustments','POST',{'productId':product['id'],'actual':20,'expected':22,'reason':'Test count'});a.call('/stock/adjustments','POST',{'productId':product['id'],'actual':19,'expected':22,'reason':'Stale count'},expected=409);assert stock()==20
report=a.call('/reports/summary');assert report['grossProfitCents']==800 and report['expensesCents']==0,report
b.call('/sales','POST',body,expected=404);b.call('/customers/'+customer['id']+'/statement',expected=404);assert b.call('/products')['total']==0
print('PASS invoices, idempotency, debt caps, stock, weighted cost, reversal, cash and tenant isolation',flush=True)
cp=phone();cashier=a.call('/employees','POST',{'name':'Cashier test','phone':cp,'email':'','role':'Cashier'});c=Client();c.owner(cp);c.call('/reports/summary',expected=403);c.call('/cash/entries','POST',{'direction':'in','amountCents':100,'description':'Denied'},expected=403)
assert c.call('/products')['items'][0]['averageCostCents'] is None
assert c.call('/sales')['items'][0]['costCents'] is None
assert c.call('/sales/'+sale['id'])['lines'][0]['unitCostCents'] is None
c.call('/purchases',expected=403);c.call('/stock/movements',expected=403);c.call('/expenses',expected=403)
a.call('/employees/'+cashier['id'],'PATCH',{'name':'Cashier test','role':'Cashier','active':False});c.call('/products',expected=401)
admin.call('/admin/shops/'+sa['id']+'/suspend','POST',{'reason':'Test suspension'});a.call('/products',expected=403);admin.call('/admin/shops/'+sa['id']+'/activate','POST',{});assert a.call('/products')['total']==1
rk=key();renew={'shopId':sa['id'],'amountCents':5000,'reference':key(),'expiresOn':str(today+datetime.timedelta(days=60))};admin.call('/admin/subscription-payments','POST',renew,command=rk);admin.call('/admin/subscription-payments','POST',renew,command=rk);assert admin.call('/admin/subscription-payments')['total']==1
ep=phone();shop('Expired shop',ep,today-datetime.timedelta(days=10));Client().owner(ep,expected=403)
negative=dict(body,lines=[{'productId':product['id'],'quantity':25,'unitPriceCents':1400}],method='credit',receivedCents=0);result=a.call('/sales','POST',negative);assert result['warnings'] and stock()==-5
anonymous.call('/auth/admin-login','POST',{'email':email,'password':password},csrf=False,expected=400)
devices=admin.call('/admin/devices?shopId='+sb['id'])['items'];admin.call('/admin/devices/'+devices[0]['id']+'/revoke','POST',{},expected=204);b.call('/products',expected=401);assert admin.call('/admin/audit')['total']>0
print('PASS roles, disabled sessions, suspension/reactivation, renewal replay, expiry, negative stock, CSRF, revoked device and audit',flush=True)
# Weighted quantities and card sales must not add cash.
weighted=a.call('/products','POST',{'name':'Z weighted','barcode':key(),'category':'food','unit':'كغم','salePriceCents':400,'minimum':1,'cartonSize':1})
a.call('/purchases','POST',{'supplierId':supplier['id'],'date':str(today),'lines':[{'productId':weighted['id'],'quantity':1.5,'factor':1,'unitCostCents':200}],'discountCents':0,'paidCents':0,'notes':''})
cash_before=a.call('/cash/summary')['balanceCents']
card=a.call('/sales','POST',{'customerId':None,'lines':[{'productId':weighted['id'],'quantity':0.375,'unitPriceCents':400}],'discountCents':0,'method':'card','receivedCents':0})
assert card['totalCents']==150 and card['costCents']==75 and a.call('/cash/summary')['balanceCents']==cash_before
# Cost of an unpurchased product is unknown, never silently reported as profit.
unknown=a.call('/products','POST',{'name':'Z unknown','barcode':key(),'category':'food','unit':'قطعة','salePriceCents':100,'minimum':0,'cartonSize':1})
unknown_sale=a.call('/sales','POST',{'customerId':customer['id'],'lines':[{'productId':unknown['id'],'quantity':1,'unitPriceCents':100}],'discountCents':0,'method':'credit','receivedCents':0})
assert unknown_sale['costComplete'] is False and a.call('/reports/summary')['grossProfitCents'] is None
print('PASS decimal quantity, card cash exclusion and unknown-cost profit handling',flush=True)
opening=a.call('/products','POST',{'name':'Opening stock','barcode':key(),'category':'food','unit':'قطعة','salePriceCents':500,'minimum':0,'cartonSize':1})
cash_before=a.call('/cash/summary')['balanceCents']
opened=a.call('/stock/openings','POST',{'productId':opening['id'],'quantity':5,'unitCostCents':300,'reason':'Initial count'})
assert opened['stock']==5 and opened['averageCostCents']==300
assert a.call('/cash/summary')['balanceCents']==cash_before
a.call('/stock/openings','POST',{'productId':opening['id'],'quantity':5,'unitCostCents':300,'reason':'Repeat'},expected=409)
print('PASS opening stock, known valuation, cash independence and duplicate opening protection',flush=True)
# Failed commands must roll back stock, cash and invoice changes.
base_stock=a.call('/products?q=Opening%20stock')['items'][0]['stock']
cash_before=a.call('/cash/summary')['balanceCents'];sales_before=a.call('/sales')['total']
cash_body={'customerId':None,'lines':[{'productId':opening['id'],'quantity':1,'unitPriceCents':500}],'discountCents':100,'method':'cash','receivedCents':1000}
a.call('/sales','POST',dict(cash_body,receivedCents=100),expected=400)
assert a.call('/products?q=Opening%20stock')['items'][0]['stock']==base_stock
assert a.call('/cash/summary')['balanceCents']==cash_before and a.call('/sales')['total']==sales_before
cash_sale=a.call('/sales','POST',cash_body)
assert cash_sale['totalCents']==400 and cash_sale['paidCents']==400 and cash_sale['changeCents']==600
assert a.call('/cash/summary')['balanceCents']==cash_before+400
assert a.call('/products?q=Opening%20stock')['items'][0]['stock']==base_stock-1
print('PASS rejected-sale rollback, cash discount, change and persisted stock/cash',flush=True)
# Each employee role is checked at API boundaries, not just hidden UI buttons.
for role in ['Warehouse','Accountant']:
 num=phone();person=a.call('/employees','POST',{'name':role+' test','phone':num,'email':'','role':role});employee=Client();employee.owner(num)
 employee.call('/products');employee.call('/purchases');employee.call('/stock/movements')
 employee.call('/sales','POST',cash_body,expected=403)
 employee.call('/employees',expected=403)
 employee.call('/cash/entries','POST',{'direction':'in','amountCents':100,'description':'Denied'},expected=403)
 employee.call('/reports/summary',expected=200 if role=='Accountant' else 403)
 employee.call('/sales',expected=200 if role=='Accountant' else 403)
 sessions=[d for d in a.call('/devices')['items'] if d['userId']==person['id'] and d['active']]
 assert sessions
 for session in sessions:a.call('/devices/'+session['id']+'/revoke','POST',{})
 employee.call('/products',expected=401)
print('PASS warehouse/accountant access matrix and protected financial commands',flush=True)
# Renewal cannot silently remove a manual suspension.
admin.call('/admin/shops/'+sa['id']+'/suspend','POST',{'reason':'Renewal safety test'})
admin.call('/admin/subscription-payments','POST',dict(renew,reference=key(),expiresOn=str(today+datetime.timedelta(days=90))))
a.call('/products',expected=403)
admin.call('/admin/shops/'+sa['id']+'/activate','POST',{});a.call('/products')
print('PASS renewed subscription remains manually suspended until explicit activation',flush=True)
print('ALL SMOKE TESTS PASSED',flush=True)
