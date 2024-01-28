using Microsoft.Extensions.DependencyInjection;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using DeGA.Core.Pipeline;
using Microsoft.Extensions.Configuration;

namespace DeGA.Core;

public sealed record DeGAServiceBuilder(IServiceCollection Services, IConfigurationSection Config)
{
    public DeGAServiceBuilder AddAction<TActionDefinition>()
        where TActionDefinition : class, IActionDefinition
    {
        Services.AddTransient<IActionDefinition, TActionDefinition>(); 
        return this;
    }
}
