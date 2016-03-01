// +build influxdb

package connector

import (
	"fmt"
	"regexp"
	"strings"
	"time"
	"net/url"
    "encoding/json"
	

	"github.com/facette/facette/pkg/catalog"
	"github.com/facette/facette/pkg/config"
	"github.com/facette/facette/pkg/plot"
	"github.com/influxdata/influxdb/client"
)

// InfluxDBConnector2 represents the main structure of the InfluxDB connector.
type InfluxDBConnector2 struct {
	name     string
	host     string
	useTLS   bool
	username string
	password string
	database string
	client   client.Client
	re       *regexp.Regexp
	series   map[string]map[string][2]string
}

	

func init() {
	Connectors["influxdb2"] = func(name string, settings map[string]interface{}) (Connector, error) {
		var (
			pattern string
			err     error
		)
	
		
		connector := &InfluxDBConnector2{
			name:     name,
			host:     "localhost:8086",
			username: "root",
			password: "root",
			series:   make(map[string]map[string][2]string),
		}
		
		
		if connector.host, err = config.GetString(settings, "host", false); err != nil {
			return nil, err
		}

		if connector.useTLS, err = config.GetBool(settings, "use_tls", false); err != nil {
			return nil, err
		}

		if connector.username, err = config.GetString(settings, "username", false); err != nil {
			return nil, err
		}

		if connector.password, err = config.GetString(settings, "password", false); err != nil {
			return nil, err
		}

		if connector.database, err = config.GetString(settings, "database", true); err != nil {
			return nil, err
		}

		if pattern, err = config.GetString(settings, "pattern", true); err != nil {
			return nil, err
		}

		// Check and compile regexp pattern
		if connector.re, err = compilePattern(pattern); err != nil {
			return nil, fmt.Errorf("unable to compile regexp pattern: %s", err)
		}


		u, err := url.Parse(connector.host)
		
		
		cl, err := client.NewClient(client.Config{
			URL: *u,
			Username: connector.username,
			Password: connector.password,
			UnsafeSsl: connector.useTLS,
		})
		
		connector.client = *cl

		if err != nil {
			return nil, fmt.Errorf("unable to create client: %s", err)
		}

		fmt.Println("*** influxdb connector succesfully initialized %v", *connector)
		return connector, nil
	}
}

// GetName returns the name of the current connector.
func (connector *InfluxDBConnector2) GetName() string {
	return connector.name
}

// GetPlots retrieves time series data from provider based on a query and a time interval.
func (connector *InfluxDBConnector2) GetPlots(query *plot.Query) ([]*plot.Series, error) {
	
	l := len(query.Series)
	if l == 0 {
		return nil, fmt.Errorf("influxdb[%s]: requested series list is empty", connector.name)
	}

	columns := make([]string, l)
	for i, series := range query.Series {
		columns[i] = connector.series[series.Source][series.Metric][1]
	}

	// Old Query
	// "select %s from %s where time > %ds and time < %ds order asc",
		
	influxdbQuery := fmt.Sprintf(
		"select * from %s where time > %ds and time < %ds order by time asc",
		strings.Join(columns, ","),
		query.StartTime.Unix(),
		query.EndTime.Unix(),
	)
	
	fmt.Println("influxdbQuery=", influxdbQuery)
	q := client.Query{
		Command:  influxdbQuery,
		Database: connector.database,
	}
	
	response, err := connector.client.Query(q)
	 if err != nil {
		return nil, fmt.Errorf("influxdb[%s]: unable to perform query: %s", connector.name, err)
	 }

	results := make([]*plot.Series, 0)
	step := int(query.EndTime.Sub(query.StartTime) / time.Duration(query.Sample))
	
	for _, result := range response.Results {
		
		for _, row := range result.Series {
			
			valuesLength := len(row.Values)
			
			if valuesLength < 1 {
				continue
			}
			
			var plotSeries = &plot.Series{
				Name: row.Name,
				Step: step,
				Plots:  make([]plot.Plot, valuesLength),  
			}
			
			fmt.Println("plotSeries.Plots=", len(plotSeries.Plots) )
			
			for valueIndex, values := range row.Values {
					
					value, failed := values[5].(json.Number).Float64()
					if failed != nil {
						continue
					}
					
					
					valueTime, failed := time.Parse(time.RFC3339, values[0].(string))
					if failed != nil {
							continue
					}
					plotSeries.Plots[valueIndex].Time = valueTime
					plotSeries.Plots[valueIndex].Value = plot.Value( value  )
			}
			
			results = append(results, plotSeries)
		}
	}
	
		
	
	
	return results, nil
}

// Refresh triggers a full connector data update.
func (connector *InfluxDBConnector2) Refresh(originName string, outputChan chan<- *catalog.Record) error {
	q := client.Query{
		Command:  "show series",
		Database: connector.database,
	}
	
	
	seriesResults, err := connector.client.Query(q)
	if err != nil {
		return fmt.Errorf("ERROR!!!! influxdb[%s]: unable to fetch series list: %s, %v", connector.name, err, q)
	} 
	   
	
	for _, result := range seriesResults.Results {
		
		for _, row := range result.Series {
			
			for _, values := range row.Values {
										
					var metricName string = row.Name
					var sourceName string = values[1].(string)
					
					if _, ok := connector.series[sourceName]; !ok {
							connector.series[sourceName] = make(map[string][2]string)
					}
		
					connector.series[sourceName][metricName] = [2]string{sourceName, metricName}
					
					catalogRecord := catalog.Record{
						Origin:    originName,
						Source:    sourceName,
						Metric:    metricName,
						Connector: connector,
					}
					
					outputChan <- &catalogRecord
				
			}
		
		}
	}

	return nil
}
