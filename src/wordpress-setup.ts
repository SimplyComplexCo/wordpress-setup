import * as fs from 'fs';
import * as process from 'process';
import * as path from 'path';
import * as util from 'util';

import * as prompt from 'prompt';
import * as optimist from 'optimist';
import chalk from 'chalk';
import * as Mustache from 'mustache';
import * as request from 'request-promise';
import { Client } from 'ssh2';
import { StringDecoder } from 'string_decoder';

const writeFile = util.promisify(fs.writeFile);
const readFile = util.promisify(fs.readFile);
const exists = util.promisify(fs.exists);

const SERVER_SIZE = optimist.argv.serverSize || '1gb';
const SERVER_IMAGE = optimist.argv.serverImage || 'ubuntu-16-04-x64';

prompt.override = optimist.argv;

prompt.delimiter = chalk.green(' >< ');
prompt.message = '$';
prompt.start();
const promptSchema = {
  properties: {
    subdomain: {
      description: chalk.green('Enter your new servers subdomain'),
      type: 'string',
      required: true,
      message: `Subdomain is ${chalk.red('required')}`
    },
    rootDomain: {
      description: chalk.green('Enter your root/naked domain'),
      type: 'string',
      required: true,
      message: `Root domain is ${chalk.red('required')}`
    },
    email: {
      description: chalk.green('Enter your email address (will be used for ssl cert notifications)'),
      type: 'string',
      required: true,
      message: `Email is ${chalk.red('required')}`
    },
    identity: {
      description: chalk.green('Enter your ssh key identity path (public will be added to authorized in web user)'),
      type: 'string',
      required: true,
      message: `Public ssh identity path is ${chalk.red('required')} (see ${chalk.blue('https://www.digitalocean.com/community/tutorials/how-to-set-up-ssh-keys--2')} )`
    },
    apiToken: {
      description: chalk.green('Enter your digitalocean API token (will be used to setup the subdomain)'),
      type: 'string',
      required: true,
      message: `API Token is ${chalk.red('required')} (see ${chalk.blue('https://www.digitalocean.com/community/tutorials/how-to-use-the-digitalocean-api-v2')} )`
    },
    mysqlRootPassword: {
      description: chalk.green('Enter a MySQL root password'),
      type: 'string',
      hidden: true,
      required: true,
      message: `MySQL root password is ${chalk.red('required')}`
    },
    mysqlRootPasswordConfirm: {
      description: chalk.green('Enter a MySQL root password again'),
      type: 'string',
      hidden: true,
      required: true,
      message: `MySQL root password is ${chalk.red('required')}`
    },
    mysqlWordpressPassword: {
      description: chalk.green('Enter a MySQL wordpress password'),
      type: 'string',
      hidden: true,
      required: true,
      message: `MySQL wordpress password is ${chalk.red('required')}`
    },
    mysqlWordpressPasswordConfirm: {
      description: chalk.green('Enter a MySQL wordpress password again'),
      type: 'string',
      hidden: true,
      required: true,
      message: `MySQL wordpress password is ${chalk.red('required')}`
    },
    region: {
      description: chalk.green('Enter a DigitalOcean Region'),
      type: 'string',
      default: 'sfo2'
    }
  }
}

function invalidRegion(message, regions) {
  console.error(chalk.red('Error: ') + `${message} Available regions are: `)
  for(const available of regions.regions) {
    if(available.available && available.sizes.includes(SERVER_SIZE)) {
      console.error('\t' + available.name + ': ' + available.slug);
    }
  }
  process.exit(254);
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

prompt.get(promptSchema, async (error, result) => {
  if(error) {
    console.error('\n' + chalk.red('Error: ') + error.message);
    process.exit(255);
  }

  try {
    if(result.subdomain) {
      result.hostname = result.subdomain + '.' + result.rootDomain;
    } else {
      result.hostname = result.rootDomain;
    }

    const identityPath = path.resolve(result.identity);

    if(!(await exists(identityPath + '.pub')) || !(await exists(identityPath))) {
      console.error(chalk.red('Error: ') + `given identity ${identityPath} does not exist`);
      process.exit(255);
    }

    const privateKey = (await readFile(identityPath)).toString();
    const publicKey = (await readFile(identityPath + '.pub')).toString();
    result.sshKey = publicKey;

    const cfg = Mustache.render(await readFile(path.join(__dirname, '..', 'wordpress.cfg'), 'utf8'), result);
    const serversJson = path.join(__dirname, '..', 'wordpress.servers.json');
    let wordpressServers = [];

    if(await exists(serversJson)) {
      const wordpressServersText = await readFile(serversJson, 'utf8');
      wordpressServers = JSON.parse(wordpressServersText);
    }

    console.log(chalk.yellow('Validating options'));
    const getRegions = {
      uri: 'https://api.digitalocean.com/v2/regions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${result.apiToken}`
      },
      json: true // Automatically parses the JSON string in the response
    }

    const regions = await request(getRegions);

    let validRegion = false;

    // console.log(JSON.stringify(regions, null, ' '));
    for(const region of regions.regions) {
      if(region.slug === result.region) {
        if(!region.available) {
          return invalidRegion(`${region.name} is not available right now, please choose another.`, regions)
        } else if(!region.sizes.includes(SERVER_SIZE)) {
          return invalidRegion(`${region.name} does not support a ${SERVER_SIZE} server right now, please choose another.`, regions)
        } else {
          validRegion = true;
        }
      }
    }

    if(!validRegion) {
      return invalidRegion(`${result.region} is not a valid region slug, please choose another.`, regions)
    }

    let fingerprints = optimist.argv.fingerprint;
    if(optimist.argv.fingerprint && !Array.isArray(optimist.argv.fingerprint)) {
      fingerprints = [optimist.argv.fingerprint]
    }

    const postDropletCreateOptions = {
      method: 'POST',
      uri: 'https://api.digitalocean.com/v2/droplets',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${result.apiToken}`
      },
      body: {
        name: result.hostname,
        region: result.region,
        size: SERVER_SIZE,
        image: SERVER_IMAGE,
        backups: true,
        ipv6: true,
        ssh_keys: fingerprints,
        user_data: cfg,
        tags: ['automatic_wordpress', 'wordpress', 'web', result.domain]
      },
      json: true // Automatically parses the JSON string in the response
    };

    console.log(chalk.yellow('Creating Droplet'));
    const created = await request(postDropletCreateOptions);

    wordpressServers[created.droplet.id] =  {
      server: result.hostname,
      droplet: created.droplet
    };

    await writeFile(serversJson, JSON.stringify(wordpressServers, null, ' '));

    let serverActive = created.droplet.status === 'active';
    const getDroplet = {
      uri: `https://api.digitalocean.com/v2/droplets/${created.droplet.id}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${result.apiToken}`
      },
      json: true // Automatically parses the JSON string in the response
    };

    process.stdout.write(chalk.yellow('Awaiting activation '));

    let droplet;
    while(!serverActive) {
      process.stdout.write('.');
      await timeout(3000);

      droplet = await request(getDroplet);
      serverActive = droplet.droplet.status === 'active' && droplet.droplet.networks && droplet.droplet.networks.v4 && droplet.droplet.networks.v4[0] && droplet.droplet.networks.v4[0].ip_address;
    }

    wordpressServers[created.droplet.id].droplet = droplet.droplet;
    await writeFile(serversJson, JSON.stringify(wordpressServers, null, ' '));
    console.log(chalk.green(' ACTIVE') + ` you can now ${chalk.bgMagenta('ssh -i ' + identityPath  + ' web@' + droplet.droplet.networks.v4[0].ip_address)} using your given ssh key`);

    console.log(chalk.yellow('Connecting to server to check setup progress:'));
    const length = 90000/500
    for(let i = 0; i < length; i++){
      process.stdout.write('.');
      await timeout(500);
      try {
        await getCloudLog(wordpressServers[created.droplet.id], privateKey);
        break;
      } catch (e) {
        // ignore untill last
        if(i === length - 1) {
          console.error(chalk.red('Error: ') + e.message);
          process.exit(255);
        }
      }

    }

  } catch(e) {
    console.error(chalk.red('Error: ') + e.message);
    process.exit(255);
  }

  prompt.stop();
});

function getCloudLog(server, privateKey) {
  return new Promise((resolve, reject) => {
    const connection = new Client();
    connection.on('ready', () => {
      connection.exec('tail -n 9999 -f /var/log/cloud-init-output.log', (error, stream) => {
        if(error) {
          return reject(new Error(`Server failed to full activate you can troubleshoot at IP ${server.droplet.networks.v4[0].ip_address} (droplet id ${server.droplet.id}):  ${error.message}`));
        }
        stream.on('close', (code, signal) => {
          console.error(chalk.green('Server Connection Closed'));
          resolve();
        });
        stream.on('data', (data) => {
          const stringData = data.toString();
          const outData = stringData
            .replace(/([\[\( ])(ERROR|error|Error)([\]\) :])/, '$1' + chalk.red('$2') + '$3')
            .replace(/([\[\( ])(WARNING|warning|Warning)([\]\) :])/, '$1' + chalk.yellow('$2') + '$3')
            .replace(/([\[\( ])(INFO|info|Info)([\]\) :])/, '$1' + chalk.blue('$2') + '$3');

          process.stdout.write(outData);
          if(stringData.match(/.*?Cloud-init v. [0-9\.]+ finished at.*/)) {
            connection.destroy();
          }
        }).stderr.on('data', (data) => {
          console.error(chalk.red(data.toString()));
        });
      });
    }).connect({
      host: server.droplet.networks.v4[0].ip_address,
      port: 22,
      username: 'root',
      privateKey: privateKey,
      readyTimeout: 999999
    })
    connection.on('error', (error) => {
      reject(error);
    });

  });

}
