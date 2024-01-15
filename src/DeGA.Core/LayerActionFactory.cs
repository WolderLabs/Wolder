using Microsoft.Extensions.DependencyInjection;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Core
{
    public sealed class LayerActionFactory
    {
        private readonly IServiceProvider _services;

        public LayerActionFactory(IServiceProvider services)
        {
            _services = services;
        }

        public TAction Create<TAction, TOption>(TOption options) 
            where TAction : ILayerAction<TOption>
            where TOption : notnull
        { 
            return ActivatorUtilities.CreateInstance<TAction>(_services, options);
        }
    }
}
