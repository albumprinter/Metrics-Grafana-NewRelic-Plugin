///<reference path="../typings/tsd.d.ts" />
import moment from 'moment';

class NewRelicDatasource {
  name: string;
  appId: any;
  baseApiUrl: string;

  /** @ngInject */
  constructor(instanceSettings, private $q, private backendSrv, private templateSrv) {
    this.name = instanceSettings.name;
    this.appId = instanceSettings.jsonData.app_id;
    this.baseApiUrl = 'api/plugin-proxy/newrelic-app';
    this.backendSrv = backendSrv;
  }

  query(options) {
    var requests = [];

    options.targets.forEach(target => {
      var value = target.value || null;
      var type = target.type || 'applications';
      /* Todo: clean up defaulting app_id based on datasource config */
      var app_id = target.app_id || this.appId;
      var id = type === 'applications' ? app_id : target.server_id;
      var request = {
        refId: target.refId,
        alias: target.alias,
        url: '/v2/' + type + '/' + id + '/metrics/data.json',
        params: {
          names: [target.target],
          to: options.range.to,
          from: options.range.from,
          period: this._convertToSeconds(options.interval || "60s")
        }
      };
      if (value) {
        request.params["values"] = [value];
      }
      if (id) {
        requests.push(request);
      }
    });
    return this.makeMultipleRequests(requests);
  }

  testDatasource() {
    var url = '/v2/applications/' +  this.appId + '.json';

    return this.makeApiRequest({url: url}).then(() => {
      return { status: "success", message: "Data source is working", title: "Success" };
    });
  }

  _convertToSeconds(interval) {
    var seconds: number = parseInt(interval);
    var unit: string = interval.slice(-1).toLowerCase();
    switch (unit) {
      case "s":
        break;
      case "m":
        seconds = seconds * 60;
        break;
      case "h":
        seconds = seconds * 3600;
        break;
      case "d":
        seconds = seconds * 86400;
        break;
    }
    return seconds;
  }

  _parseMetricResults(results) {
    var targetList = [];
    var metrics = results.response.metric_data.metrics;
    metrics.forEach(metric => {
      metric.alias = results.alias;
      targetList = targetList.concat(this._parseseacrhTarget(metric));
    });
    return targetList;
  }

  _parseseacrhTarget(metric) {
    var targets = Object.keys(metric.timeslices[0].values);
    var targetData = [];
    targets.forEach(target => {
      targetData.push({
        target: this._parseTargetAlias(metric, target),
        datapoints: this._getTargetSeries(target, metric)
      });
    });
    return targetData;
  }

  _getTargetSeries(target, metric) {
    var series = [];
    metric.timeslices.forEach(function(slice){
      series.push([slice.values[target], moment(slice.to).valueOf()]);
    });
    return series;
  }

  _parseTargetAlias(metric, value) {
    if (metric.alias) {
      return metric.alias.replace(/\$value/g, value);
    } else {
      return metric.name + ":" + value;
    }
  }

  makeMultipleRequests(requests) {
    return new Promise((resolve, reject) => {
      var mergedResults = {
        data: []
      };
      var promises = [];
      requests.forEach(request => {
        promises.push(this.makeApiRequest(request));
      });

      return Promise.all(promises).then(data => {
        data.forEach(result => {
          mergedResults.data = mergedResults.data.concat(this._parseMetricResults(result));
        });
        resolve(mergedResults);
      });
    });
  }

  getMetricNames(application_id) {
    if (!application_id) {
      application_id = this.appId;
    }

    let request = {
      url: '/v2/applications/' + application_id + '/metrics.json'
    };

    return this.makeApiRequest(request)
    .then(result => {
      if (result && result.response && result.response.metrics) {
        return result.response.metrics;
      } else {
        return [];
      }
    });
  }

  getApplications(value = 1, extResult = []) {  
    let request = {
      url: '/v2/applications.json?page='+value
    };

    return this.makeApiRequest(request)
    .then(result => {      
      if (result && result.response && result.response.applications && result.response.applications.length > 0) {
        return this.getApplications(value+1, result.response.applications).then(resultInt => {
            return extResult.concat(resultInt);
          }
        )               
      } else {
        return extResult;
      }
    });
  }

  makeApiRequest(request) {
    var options: any = {
      method: "get",
      url: this.baseApiUrl + request.url,
      params: request.params,
      data:   request.data,
    };

    return this.backendSrv.datasourceRequest(options)
    .then(result => {
      return {response: result.data, refId: request.refId, alias: request.alias };
    })
    .catch(err => {
      if (err.status !== 0 || err.status >= 300) {
        if (err.data && err.data.error) {
          throw { message: 'New Relic Error Response: ' + err.data.error.title, data: err.data, config: err.config };
        } else {
          throw { message: 'New Relic Error: ' + err.message, data: err.data, config: err.config };
        }
      }
    });
  }

}

export {NewRelicDatasource};
