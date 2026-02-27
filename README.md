# Getting Started
This app creates an overview for users to monitor what roles have access to spaces, pages and apps. 

## Create a destination 
To collect workzone zip file, create a destination.  
You can find client id and secret in the service-key of the service: SAP Build Work Zone, standard edition  
![](img/service-key.png "Find client id and secret")
  
Create a destination with the following params
- name: workzone-api
- url : https://portal-service.cfapps.eu20.hana.ondemand.com 
- Type: HTTP
- Auth: OAuth2JWTBearer
- token url : https://b-fdn-dev.authentication.eu20.hana.ondemand.com/oauth/token?grant_type=client_credentials
- username : <clientid_found_in_service-key>
- password : <clientsecret_found_in_service-key>
   
![](img/destination.png "Find client id and secret")

## Frontend 
To get an overview of your workzone, change the app so that your site id is collected.   
In the [`srv/interactions.js`](/srv/interactions.js) on the top of the file, change the workzone site id to the site id of your site. 
```ts
 const WORKZONE_SITE_ID = 'your-workzone-siteid';
```
Find the site ID so that you can choose what page to collect the zip from.  
  
## Run app

- Open a new terminal and run `cds watch`


## Deployment

mbt build  
cf deploy <path_to_mtafile>


