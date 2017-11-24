# @simplycomplex/wordpress-setup

Wordpress setup script and runner built on [Node.js](https://nodejs.org) for DigitalOcean servers.

This is intended as a command line tool for setting up DigitalOcean servers to host a fast wordpress server and is intended to server as an all in one server based on the $10+ servers.

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for running your own server setups.

### Prerequisites

* Requires [Node.js](https://nodejs.org) version 8+, we recommend getting node via [NVM](https://github.com/creationix/nvm).
* Requires a [DigitalOcean](https://digitalocean.com) (our affialite [link]()) account and API Key
  * Get an API key from your DigitalOcean dashboard > Settings >
  * Get an ssh key fingerprint from DigitalOcean dashboard > Settings > Security > Add SSH Key then copy the generated fingerprint for running the create script
  * DigitalOcean must manage your Domains for you (see [here](https://www.digitalocean.com/community/tutorials/how-to-set-up-a-host-name-with-digitalocean) for more info on managing your domains with DigitalOcean)
### Installing

To get up an running:

```
git clone --depth=1 https://github.com/SimplyComplexCo/wordpress-setup.git
cd wordpress-setup
npm install
or
yarn install
```

## Running wordpress setup

Make sure to put appropriate values for your environment and DigitalOcean setup in the script below before running it.

```
npm run create -- --subdomain stage \
  --rootDomain my-domain.test \
  --email email@my-domain.test \
  --identity ~/.ssh/id_rsa \
  --apiToken <digital_ocean_api_key> \
  --mysqlRootPassword <your_new_mysql_root_password> \
  --mysqlRootPasswordConfirm <your_new_mysql_root_password> \
  --mysqlWordpressPassword <your_new_mysql_wordpress_user_password> \
  --mysqlWordpressPasswordConfirm <your_new_mysql_wordpress_user_password> \
  --region sfo2 \
  --fingerprint <uploaded_ssh_key_fingerprint>
```

This will create a new 10GB droplet on your digital ocean account that is setup to be accesed at https://my-domain.test. It will setup the SSL certificates for you and get them ready for renewal. Enjoy your new wordpress server.

To login to your server backend after setup you need to `ssh web@my-domain.test` with your ssh key.

## Running wordpress destroy (for servers managed/created by this service)

You can completely destory and clean up DNS changes for servers created by this service using the destroy command as follows.

Make sure to put appropriate values for your environment and DigitalOcean setup in the script below before running it.

```
npm run destroy -- --subdomain stage \
  --domain my-domain.test \
  --apiToken <digital_ocean_api_key>
```

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/your/project/tags).

## Authors/Contributors
[<img alt="paullryan" src="https://avatars2.githubusercontent.com/u/3146164?v=4&s=117" width="117">](https://github.com/paullryan) |
:---: |
[paullryan](https://github.com/paullryan) |

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details
