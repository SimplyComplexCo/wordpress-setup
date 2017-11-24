import * as fs from 'fs';
import * as process from 'process';
import * as path from 'path';
import * as util from 'util';

import * as prompt from 'prompt';
import * as optimist from 'optimist';
import chalk from 'chalk';
import * as request from 'request-promise';

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);
const exists = util.promisify(fs.exists);

prompt.override = optimist.argv;

prompt.delimiter = chalk.green(' >< ');
prompt.message = '$';
prompt.start();
const promptSchema = {
  properties: {
    subdomain: {
      description: chalk.green('Enter your subdomain to destroy'),
      type: 'string',
      required: true,
      message: `Subdomain is ${chalk.red('required')}`
    },
    domain: {
      description: chalk.green('Enter your domain to destroy subdomain from'),
      type: 'string',
      required: true,
      message: `Domain is ${chalk.red('required')}`
    },
    apiToken: {
      description: chalk.green('Enter your digitalocean API token (will be used to setup the subdomain)'),
      type: 'string',
      required: true,
      message: `API Token is ${chalk.red('required')} (see ${chalk.blue('https://www.digitalocean.com/community/tutorials/how-to-use-the-digitalocean-api-v2')} )`
    }
  }
}


prompt.get(promptSchema, async (error, result) => {
  if(error) {
    console.error('\n' + chalk.red('Error: ') + error.message);
    process.exit(255);
  }

  try {
    const hostname = `${result.subdomain}.${result.domain}`;

    const serversJson = path.join(__dirname, '..', 'wordpress.servers.json');

    if(!await exists(serversJson)) {
      console.error(chalk.red('Error: ') + ` droplet with hostname ${hostname} is not managed by this service. Please go to DO control panel to remove it.`)
      process.exit(255);
    }
    const wordpressServersText = await readFile(serversJson, 'utf8');
    let wordpressServers = JSON.parse(wordpressServersText);

    let wordpressServer;
    for(let key in wordpressServers) {
      const server = wordpressServers[key];
      if(server.server === hostname) {
        wordpressServer = server;
        break;
      }
    }

    if(!wordpressServer) {
      console.error(chalk.red('Error: ') + ` droplet with hostname ${hostname} is not managed by this service. Please go to DO control panel to remove it.`)
      process.exit(255);
    }

    const listDomainRecords = {
      method: 'GET',
      uri: `https://api.digitalocean.com/v2/domains/${result.domain}/records`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${result.apiToken}`
      }
    };

    const records = JSON.parse(await request(listDomainRecords));

    let domainRecord;

    for(const record of records.domain_records) {
      if(record.type === 'A' && record.name === result.subdomain) {
        domainRecord = record;
      }
    }


    if(domainRecord) {
      const deleteDomainRecord = {
        method: 'DELETE',
        uri: `https://api.digitalocean.com/v2/domains/${result.domain}/records/${domainRecord.id}`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${result.apiToken}`
        }
      };

      await request(deleteDomainRecord);
    }

    const destroyDroplet = {
      method: 'DELETE',
      uri: `https://api.digitalocean.com/v2/droplets/${wordpressServer.droplet.id}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${result.apiToken}`
      }
    };

    await request(destroyDroplet);

    delete wordpressServers[wordpressServer.droplet.id];

    await writeFile(serversJson, JSON.stringify(wordpressServers, null, ' '));
  } catch(e) {
    console.error(chalk.red('Error: ') + e.message);
    process.exit(255);
  }

  prompt.stop();
});
